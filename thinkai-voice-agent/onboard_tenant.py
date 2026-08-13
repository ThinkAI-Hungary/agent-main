#!/usr/bin/env python3
"""
eaisyDesk — Tenant Onboarding CLI script.

Létrehoz egy új tenant-ot a multi-tenant SaaS-ban, 3 user-rel (admin, manager,
member) és az összes szükséges config-tábla seed-jével.

Használat:
    python onboard_tenant.py \
        --slug dentors \
        --name "Dentors Szeged" \
        --plan pro \
        --admin-username dentors_admin \
        --admin-password 'DentorsAdmin2026!' \
        --admin-email info@dentors.com \
        --manager-username dentors_manager \
        --manager-password 'DentorsManager2026!' \
        --member-username dentors_member \
        --member-password 'DentorsMember2026!' \
        --practice-name "DENTORS Orvosi és Oktatási Kft." \
        --address "6724 Szeged, Jakab Lajos utca 9/A" \
        --sender-email "info@dentors.com"

Interaktív mód (promptok):
    python onboard_tenant.py --interactive
"""

import argparse
import json
import sys
import os
from pathlib import Path
from datetime import datetime

# Backend import (a thinkai-voice-agent könyvtárból kell futtatni)
THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR))

import database as db
from loguru import logger


def create_tenant(slug: str, name: str, plan: str = "trial") -> str | None:
    """Tenant létrehozása. Visszaadja a tenant UUID-t, vagy None ha már létezik."""
    if not db.supabase:
        print("❌ Nincs Supabase kapcsolat!")
        return None
    try:
        existing = db.supabase.table("tenants").select("id").eq("slug", slug).execute()
        if existing.data:
            print(f"⚠️  A '{slug}' tenant már létezik (id={existing.data[0]['id']}).")
            return existing.data[0]["id"]
        res = db.supabase.table("tenants").insert({
            "slug": slug, "name": name, "plan": plan, "active": True
        }).execute()
        tid = res.data[0]["id"]
        print(f"✅ Tenant létrehozva: {name} (slug={slug}, id={tid})")
        return tid
    except Exception as e:
        print(f"❌ Tenant létrehozási hiba: {e}")
        return None


def create_users(tenant_id: str, users: list[dict]) -> bool:
    """3 user létrehozása a tenant-hez. A sorrend számít: admin, member, manager
    (a max-1-manager constraint miatt a manager-t utoljára)."""
    db.set_current_tenant(tenant_id)
    all_ok = True
    for u in users:
        role = u["role"]
        ok = db.create_admin_user(
            username=u["username"],
            password=u["password"],
            email=u.get("email", ""),
            role=role,
            created_by="onboard_tenant.py",
            full_name=u.get("full_name", ""),
        )
        if ok:
            print(f"  ✅ {role}: {u['username']} ({u.get('full_name', '')})")
        else:
            print(f"  ❌ {role}: {u['username']} — HIBA (talán már létezik?)")
            all_ok = False
    return all_ok


def seed_config(tenant_id: str, config: dict):
    """Config-táblák seed-elése az új tenant-hez."""
    db.set_current_tenant(tenant_id)

    # business_info
    bi = {
        "practice_name": config.get("practice_name", config.get("name", "")),
        "sender_name": config.get("practice_name", ""),
        "sender_email": config.get("sender_email", ""),
        "address": config.get("address", ""),
        "description": "",
        "service_description": "",
        "new_patient_auto_visit": True,
    }
    db.update_business_info(bi)
    print(f"  ✅ business_info: {bi['practice_name']}")

    # agent_settings (alapértelmezett hang + köszöntés)
    db.update_agent_settings({
        "voice_id": "Puck",
        "greeting": f"Üdvözlöm! {config.get('practice_name', '')} virtuális asszisztense vagyok. Miben segíthetek?",
        "language": "hu",
        "tone": "barátságos, szakmai",
    })
    print(f"  ✅ agent_settings: voice=Puck, greeting beállítva")

    # knowledge_base (üres, de létrejön a sor)
    db.update_knowledge_base({"content": "{}"})
    print(f"  ✅ knowledge_base: üres (a Settings-ben tölthető)")

    # text_configs — alapértelmezett system_prompt placeholder + written_behavior=approval
    db.update_text_config("system_prompt", (
        f"Te a(z) {{{{practice_name}}}} virtuális telefonos asszisztense vagy.\n"
        "Mai dátum: {{today}}\n\n"
        "## Szabályok\n"
        "- Legyél udvarias, segítőkész és világos.\n"
        "- Magyarul beszélj.\n"
        "- Ha panaszt hallasz, azonnal jelezd (report_alert).\n"
    ))
    db.update_text_config("written_behavior", "approval")
    db.update_text_config("issue_handling", json.dumps({
        "writtenBehavior": "approval",
        "defaultRequestNotify": "email",
        "defaultComplaintNotify": "email",
        "customRules": [],
    }))
    print(f"  ✅ text_configs: system_prompt + written_behavior=approval + issue_handling")

    # triage_rules — az alap 5 ügytípus + kontextus-szabályok (másolat a seed-ből)
    _seed_triage_rules(tenant_id)

    # reminder_settings (alapértelmezett)
    db.update_reminder_settings({
        "reminder_enabled": False,
        "reminder_hours": 24,
        "reminder_template": (
            "Kedves {nev}!\n\n"
            "Ez egy emlékeztető, hogy {idopont}-kor van egy időpontja "
            "{szolgaltatas} témában.\n\n"
            "Üdvözlettel: {practice_name}"
        ),
    })
    print(f"  ✅ reminder_settings: disabled (alapértelmezett)")

    # kanban_columns — alap oszlopok
    _seed_kanban_columns(tenant_id)


def _seed_triage_rules(tenant_id: str):
    """Az alap 5 ügytípus triage_rules seed-elése (a migrate_decision_matrix.sql alapján)."""
    db.set_current_tenant(tenant_id)
    rules = [
        ("Kérdés", "onallo"),
        ("Kérés", "ember"),
        ("Panasz", "surgos"),
        ("Időpont", "onallo"),
        ("Egyéb", "ember"),
    ]
    for situation, priority in rules:
        db.upsert_triage_rule(situation=situation, priority=priority, escalation_email=None)
    print(f"  ✅ triage_rules: {len(rules)} alap ügytípus")


def _seed_kanban_columns(tenant_id: str):
    """Alap kanban oszlopok."""
    db.set_current_tenant(tenant_id)
    # Ha már vannak oszlopok, nem írjuk felül
    existing = db.get_kanban_columns()
    if existing:
        print(f"  ⏭️  kanban_columns: már vannak ({len(existing)} db)")
        return
    default_cols = [
        {"id": "uj", "name": "Új érdeklődők", "order_index": 0},
        {"id": "kapcsolat", "name": "Kapcsolatban", "order_index": 1},
        {"id": "szerzodott", "name": "Szerződött", "order_index": 2},
        {"id": "sikeres", "name": "Sikeres", "order_index": 3},
    ]
    for col in default_cols:
        db.supabase.table("kanban_columns").insert(
            db._with_tenant({"id": col["id"], "name": col["name"], "order_index": col["order_index"]})
        ).execute()
    print(f"  ✅ kanban_columns: {len(default_cols)} alap oszlop")


def interactive_prompt():
    """Interaktív prompt-al bekéri a tenant adatait."""
    print("\n🏢 eaisyDesk Tenant Onboarding\n" + "=" * 40)
    slug = input("Tenant slug (pl. dentors): ").strip()
    name = input("Tenant neve (pl. Dentors Szeged): ").strip()
    plan = input("Plan (trial/pro, default: trial): ").strip() or "trial"

    print("\n── Admin user ──")
    admin_username = input("  Felhasználónév: ").strip()
    admin_password = input("  Jelszó: ").strip()
    admin_email = input("  Email (opcionális): ").strip()
    admin_full = input("  Teljes név (opcionális): ").strip()

    print("\n── Manager user ──")
    manager_username = input("  Felhasználónév: ").strip()
    manager_password = input("  Jelszó: ").strip()
    manager_full = input("  Teljes név (opcionális): ").strip()

    print("\n── Member user ──")
    member_username = input("  Felhasználónév: ").strip()
    member_password = input("  Jelszó: ").strip()
    member_full = input("  Teljes név (opcionális): ").strip()

    print("\n── Praxis adatai ──")
    practice_name = input("  Praxis neve (pl. DENTORS Kft.): ").strip()
    address = input("  Cím: ").strip()
    sender_email = input("  Küldő email (pl. info@dentors.com): ").strip()

    return {
        "slug": slug, "name": name, "plan": plan,
        "admin_username": admin_username, "admin_password": admin_password,
        "admin_email": admin_email, "admin_full": admin_full,
        "manager_username": manager_username, "manager_password": manager_password,
        "manager_full": manager_full,
        "member_username": member_username, "member_password": member_password,
        "member_full": member_full,
        "practice_name": practice_name, "address": address, "sender_email": sender_email,
    }


def main():
    parser = argparse.ArgumentParser(description="eaisyDesk Tenant Onboarding")
    parser.add_argument("--interactive", "-i", action="store_true", help="Interaktív mód")
    parser.add_argument("--slug", help="Tenant slug (pl. dentors)")
    parser.add_argument("--name", help="Tenant neve")
    parser.add_argument("--plan", default="trial", help="Plan: trial/pro")
    parser.add_argument("--admin-username", dest="admin_username")
    parser.add_argument("--admin-password", dest="admin_password")
    parser.add_argument("--admin-email", dest="admin_email", default="")
    parser.add_argument("--admin-full", dest="admin_full", default="")
    parser.add_argument("--manager-username", dest="manager_username")
    parser.add_argument("--manager-password", dest="manager_password")
    parser.add_argument("--manager-full", dest="manager_full", default="")
    parser.add_argument("--member-username", dest="member_username")
    parser.add_argument("--member-password", dest="member_password")
    parser.add_argument("--member-full", dest="member_full", default="")
    parser.add_argument("--practice-name", dest="practice_name", default="")
    parser.add_argument("--address", default="")
    parser.add_argument("--sender-email", dest="sender_email", default="")
    args = parser.parse_args()

    if args.interactive:
        a = interactive_prompt()
    else:
        required = ["slug", "name", "admin_username", "admin_password",
                     "manager_username", "manager_password",
                     "member_username", "member_password"]
        missing = [r for r in required if not getattr(args, r)]
        if missing:
            parser.error(f"Hiányzó kötelező argumentumok: {', '.join('--' + m.replace('_', '-') for m in missing)}\n"
                         f"Vagy használd az --interactive (-i) flag-et.")
        a = vars(args)

    # 1. Tenant létrehozása
    print("\n🏢 1/3 — Tenant létrehozása")
    print("-" * 40)
    tid = create_tenant(a["slug"], a["name"], a.get("plan", "trial"))
    if not tid:
        sys.exit(1)

    # 2. User-ek létrehozása (sorrend: admin, member, manager)
    print(f"\n👤 2/3 — User-ek létrehozása ({a['name']})")
    print("-" * 40)
    users = [
        {"role": "admin", "username": a["admin_username"], "password": a["admin_password"],
         "email": a.get("admin_email", ""), "full_name": a.get("admin_full", "")},
        {"role": "member", "username": a["member_username"], "password": a["member_password"],
         "email": "", "full_name": a.get("member_full", "")},
        {"role": "manager", "username": a["manager_username"], "password": a["manager_password"],
         "email": "", "full_name": a.get("manager_full", "")},
    ]
    create_users(tid, users)

    # 3. Config seed
    print(f"\n⚙️  3/3 — Config táblák seed-elése")
    print("-" * 40)
    seed_config(tid, {
        "name": a["name"],
        "practice_name": a.get("practice_name") or a["name"],
        "address": a.get("address", ""),
        "sender_email": a.get("sender_email", ""),
    })

    # Összefoglaló
    print("\n" + "=" * 40)
    print(f"🎉 Tenant '{a['name']}' kész!")
    print(f"   Tenant ID: {tid}")
    print(f"   Slug: {a['slug']}")
    print(f"   Login URL: https://desk.eaisy.hu/admin/")
    print(f"   Admin: {a['admin_username']}")
    print(f"   Manager: {a['manager_username']}")
    print(f"   Member: {a['member_username']}")
    print("=" * 40)
    print("\nKövetkező lépések:")
    print("  1. Teszteld a login-t mindhárom user-rel")
    print("  2. Állítsd be a tenant saját kulcsait (Meta, IMAP, SIP) a settings-ben")
    print("  3. Töltsd fel a tudásbázist (Settings → Tudástár)")


if __name__ == "__main__":
    main()
