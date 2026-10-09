# -*- coding: utf-8 -*-
"""Kimenő hívások megbízhatósága + kampány-SMS szöveg-előkészítés (2026-10-09)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from telnyx_provision import classify_sip_error as _classify_sip_error
from sms_text import strip_hungarian_accents, sms_body_prep


def test_osztalyozas_whitelist():
    exc = Exception('TwirpError(code=permission_denied): sip status: 403: Dialed number '
                    '+36301234567 is not included in whitelisted countries USA,CAN D13')
    assert _classify_sip_error(exc) == "rejected_whitelist"


def test_osztalyozas_tobbi():
    assert _classify_sip_error(Exception("SIP 486 Busy Here")) == "busy"
    assert _classify_sip_error(Exception("404 Not Found: number")) == "invalid_number"
    assert _classify_sip_error(Exception("caller did not answer within timeout")) == "no_answer"
    assert _classify_sip_error(Exception("call was declined (603)")) == "rejected"
    assert _classify_sip_error(Exception("valami egyéb")) == "failed"


def test_classify_ures():
    assert _classify_sip_error(Exception()) == "failed"


def test_db_segedek_importálhatók():
    import database
    assert callable(database.create_call_attempt)
    assert callable(database.count_call_attempts_today)
    assert callable(database.campaign_already_called)
    assert callable(database.count_sms_sent_today)
    assert callable(database.sms_campaign_already_sent)


def test_sms_text_ekezet_levagas():
    """Kampány-SMS költség-optimalizálás: ékezetes magyar → GSM-7-barát."""
    t = "Kedves Pál! Rögzítettük ő: ű — á, í, ó, ú."
    clean = strip_hungarian_accents(t)
    assert clean == "Kedves Pal! Rogzitettuk o: u — a, i, o, u."
    body, segs, enc = sms_body_prep("  Kedves  Pál!  Ez   egy  teszt — vége…")
    assert body == "Kedves Pal! Ez egy teszt - vege..." and segs == 1 and enc == "GSM7"
