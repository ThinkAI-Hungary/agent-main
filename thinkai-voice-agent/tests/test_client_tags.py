# -*- coding: utf-8 -*-
"""Unit tesztek az értékesítési címkekör 2026-10-15-i bővítéséhez
(ajánlatkérés + spot, Ultralog demo).

A tools.py importot a livekit-függőség miatt kerüljük — forrásszöveg-alapú
assertek, amik pont azt őrzik, amit a bővítés kínálni akar: a kanonikus
listában és a tag_client tool-leírásban is szerepeljenek az új címkék a
user-diktált határvonalakkal."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

TOOLS_SRC = Path(__file__).resolve().parent.parent / "tools.py"


def _src() -> str:
    return TOOLS_SRC.read_text(encoding="utf-8")


class TestSalesTagBovites:
    def test_kanonikus_lista_tartalmazza_az_uj_cimkeket(self):
        src = _src()
        assert 'PREDEFINED_CLIENT_TAGS' in src
        # A lista literáljában mindkét új címke szerepel
        lst_start = src.index("PREDEFINED_CLIENT_TAGS = [")
        lst_end = src.index("]", lst_start)
        lst = src[lst_start:lst_end]
        assert '"ajánlatkérés"' in lst
        assert '"spot"' in lst

    def test_tool_leiras_határvonalak(self):
        src = _src()
        # Határvonal (user-diktált): általános érdeklődés = potenciális ügyfél,
        # konkrét ajánlatkérés = ajánlatkérés; spot kiegészítő (fő címke mellé)
        assert "konkrét ajánlatkérés NINCS" in src
        assert "KONKRÉT árajánlatot kér" in src
        assert "KIEGÉSZÍTŐ címke" in src
        assert "'spot'" in src

    def test_arkerdeles_nem_zarja_ki_az_ajanlatkerest(self):
        src = _src()
        assert "nem zárja ki az 'ajánlatkérés' címkét" in src

    def test_email_prompt_is_tartalmazza(self):
        ep = Path(__file__).resolve().parent.parent / "email_processor.py"
        src = ep.read_text(encoding="utf-8")
        assert '"ajánlatkérés"' in src
        assert '"spot"' in src
        assert "sürgető, hamar esedékes" in src

    def test_frontend_sales_tags_lista(self):
        ic = (Path(__file__).resolve().parent.parent / "eaisydesk-frontend" / "src"
              / "helpers" / "interactionClassifiers.ts")
        src = ic.read_text(encoding="utf-8")
        sal_start = src.index("SALES_TAGS = [")
        sal_end = src.index("]", sal_start)
        sal = src[sal_start:sal_end]
        assert "'ajánlatkérés'" in sal
        assert "'spot'" in sal
