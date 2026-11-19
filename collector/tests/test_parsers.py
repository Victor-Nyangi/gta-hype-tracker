from __future__ import annotations

from datetime import date

from conftest import load

from collector.config import DEFAULT_WIKI_LANGS
from collector.sources import steam, twitch, wikipedia, youtube


def _gta6_payload(scale: float = 1.0) -> dict:
    pages = [load("twitch_streams_gta6_page1.json"), load("twitch_streams_gta6_page2.json")]
    for p in pages:
        for s in p["data"]:
            s["viewer_count"] = round(s["viewer_count"] * scale)
    return {
        "games": {
            "gta6": {
                "game_id": "123456789",
                "game_name": "Grand Theft Auto VI",
                "pages": pages,
                "truncated": False,
            },
            "gtav": {
                "game_id": "32982",
                "game_name": "Grand Theft Auto V",
                "pages": [load("twitch_streams_gtav.json")],
                "truncated": False,
            },
        }
    }


def test_twitch_parse_dedupes_and_aggregates():
    snaps = {s.game_key: s for s in twitch.parse(_gta6_payload())}
    g6 = snaps["gta6"]
    # 20 distinct streams across two pages; the duplicate keeps its higher reading.
    assert g6.stream_count == 20
    assert g6.pages == 2
    expected_total = sum(s["viewer_count"] for s in load("twitch_streams_gta6_page1.json")["data"])
    expected_total += sum(
        s["viewer_count"] for s in load("twitch_streams_gta6_page2.json")["data"][1:]
    )
    assert g6.total_viewers == expected_total
    assert len(g6.top_streams) == 10
    assert g6.top_streams[0] == twitch.TopStream("kaicenat", 412300, "en")
    assert [s.viewer_count for s in g6.top_streams] == sorted(
        (s.viewer_count for s in g6.top_streams), reverse=True
    )
    # by_language sums to the total and is ordered by viewers.
    assert sum(c.viewers for c in g6.by_language.values()) == g6.total_viewers
    assert sum(c.streams for c in g6.by_language.values()) == 20
    assert next(iter(g6.by_language)) == "en"
    assert g6.by_language["es"].streams == 3
    assert snaps["gtav"].total_viewers == 14200 + 6100 + 4800


def test_twitch_parse_game_id():
    assert twitch.parse_game_id(load("twitch_games.json"), "Grand Theft Auto VI") == "123456789"
    assert twitch.parse_game_id(load("twitch_games_empty.json"), "Grand Theft Auto VI") is None


def test_steam_parse():
    r = steam.parse_one(1086940, load("steam_1086940.json"))
    assert r == steam.SteamReading(1086940, "bg3", "Baldur's Gate 3", 30018)
    assert steam.parse_one(730, load("steam_no_count.json")).player_count is None
    payload = {
        "apps": {
            "1086940": {"status": 200, "body": load("steam_1086940.json")},
            "730": {"status": 503, "body": None},
        }
    }
    assert [x.key for x in steam.parse(payload)] == ["bg3"]


def test_steam_games_cover_the_brief():
    ids = {g.app_id for g in steam.GAMES}
    assert {271590, 1174180, 730, 1091500, 1245620, 1086940} <= ids


def test_youtube_parse_string_counts_and_missing_fields():
    stats = youtube.parse(
        {"body": load("youtube_videos.json")},
        {"QdBZY2fkU-0": "Trailer 1", "VQRLujxTm3c": "Trailer 2"},
    )
    assert stats[0] == youtube.VideoStats("QdBZY2fkU-0", "Trailer 1", 271403118, 11906552, 1301877)
    assert stats[1].comments is None  # comments hidden -> field absent
    assert youtube.parse({"body": {"items": []}}) == []


def test_wikipedia_item_and_sitelinks():
    item = wikipedia.parse_item_id(load("wiki_pageprops.json"))
    assert item == "Q23648408"
    titles = wikipedia.parse_sitelinks(load("wikidata_sitelinks.json"), item)
    assert titles["en"] == "Grand Theft Auto VI"
    assert titles["ja"] == "グランド・セフト・オートVI"
    assert titles["zh-yue"] == "俠盜獵車手VI"
    assert not any(k.endswith(("quote", "news")) or k.startswith("abstract") for k in titles)
    # every default edition really carries the article
    assert set(DEFAULT_WIKI_LANGS) <= set(titles)


def test_sitelink_to_lang():
    assert wikipedia.sitelink_to_lang("enwiki") == "en"
    assert wikipedia.sitelink_to_lang("zh_yuewiki") == "zh-yue"
    assert wikipedia.sitelink_to_lang("enwikiquote") is None
    assert wikipedia.sitelink_to_lang("commonswiki") is None


def test_wikipedia_pageviews_parse():
    days = wikipedia.parse_pageviews(
        "ja", "グランド・セフト・オートVI", load("wiki_pageviews_ja.json")
    )
    assert days[0].day == date(2026, 11, 8)
    assert days[0].project == "ja.wikipedia"
    assert all(d.views >= 0 for d in days)
    payload = {
        "editions": {
            "en": {
                "title": "Grand Theft Auto VI",
                "status": 200,
                "body": load("wiki_pageviews_en.json"),
            },
            "sah": {
                "title": "Grand Theft Auto VI",
                "status": 404,
                "body": load("wiki_pageviews_404.json"),
            },
        }
    }
    rows = wikipedia.parse(payload)
    assert {r.lang for r in rows} == {"en"}
    assert len(rows) == len(load("wiki_pageviews_en.json")["items"])


def test_article_path_encodes_non_latin_titles():
    assert wikipedia.article_path("Grand Theft Auto VI") == "Grand_Theft_Auto_VI"
    assert wikipedia.article_path("AC/DC") == "AC%2FDC"
    assert "%" in wikipedia.article_path("グランド・セフト・オートVI")
