import pytest
from pydantic import ValidationError

from app.models.site import CulturalSiteIn


def make(**over) -> CulturalSiteIn:
    data = {
        "slug": "kinkaku-ji",
        "name": {"en": "Kinkaku-ji"},
        "type": "temple",
        "region_id": "kansai",
        "city_id": "kyoto",
        "location": {"type": "Point", "coordinates": [135.73, 35.04]},
    }
    return CulturalSiteIn.model_validate({**data, **over})


def test_defaults_are_valid():
    site = make()
    assert site.availability == "available"
    assert site.latlon == (35.04, 135.73)


def test_close_must_be_after_open():
    with pytest.raises(ValidationError):
        make(open_hour=17, close_hour=9)


@pytest.mark.parametrize("bad", ["Kinkaku Ji", "kinkaku_ji", "-kinkaku", "k"])
def test_slug_must_be_url_safe(bad):
    with pytest.raises(ValidationError):
        make(slug=bad)


@pytest.mark.parametrize("coords", [[300, 35], [135, 95], [-181, 0]])
def test_coordinates_must_be_in_range(coords):
    with pytest.raises(ValidationError):
        make(location={"type": "Point", "coordinates": coords})


def test_reason_is_kept_only_while_unavailable():
    assert make(unavailable_reason="renovation").unavailable_reason is None
    paused = make(availability="temporarily_unavailable", unavailable_reason="renovation")
    assert paused.unavailable_reason == "renovation"


def test_closed_weekdays_must_be_valid():
    with pytest.raises(ValidationError):
        make(closed_weekdays=[7])