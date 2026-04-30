import codecs

with codecs.open('email_processor.py', 'r', 'utf-8') as f:
    content = f.read()

old_logic = """        db.log_interaction(
            type="email",
            topic="Email AI válasz",
            summary=f"Bejövő e-mail {from_email} címről",
            result="Sikeres válasz" if sent_ok else "Hibás küldés",
            tool_name="imap_worker_ai",
            session_id=session_id,
            funnel_stage=f_stage,
            alert_tags=alert_tags if isinstance(alert_tags, list) else [],
            handover_reason=handover_reason
        )"""

new_logic = """        db.log_interaction(
            type="email",
            topic="Email AI válasz",
            summary=f"Bejövő e-mail {from_email} címről",
            result="Várakozik jóváhagyásra",
            tool_name="imap_worker_ai",
            session_id=session_id,
            funnel_stage=f_stage,
            alert_tags=alert_tags if isinstance(alert_tags, list) else [],
            handover_reason=handover_reason,
            approval_status="pending",
            ai_draft_response=draft_json
        )"""

content = content.replace(old_logic, new_logic)

with codecs.open('email_processor.py', 'w', 'utf-8') as f:
    f.write(content)
