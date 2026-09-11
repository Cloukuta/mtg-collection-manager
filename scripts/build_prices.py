import gzip
import json
import os
import tempfile
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

import ijson


MTGJSON_BASE = "https://mtgjson.com/api/v5"

IDENTIFIERS_URL = (
    f"{MTGJSON_BASE}/AllIdentifiers.json.gz"
)

PRICES_URL = (
    f"{MTGJSON_BASE}/AllPricesToday.json.gz"
)

OUTPUT_FILE = os.path.join(
    "data",
    "prices.json",
)


# ============================================================
# DOWNLOAD
# ============================================================

def download(
    url,
    destination,
):
    print(
        f"Downloading: {url}"
    )

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "mtg-collection-manager/1.0 "
                "(GitHub price updater)"
            )
        },
    )

    with urllib.request.urlopen(
        request
    ) as response:

        with open(
            destination,
            "wb",
        ) as output:

            while True:

                chunk = response.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                output.write(
                    chunk
                )

    print(
        f"Saved: {destination}"
    )


# ============================================================
# PRICE HELPERS
# ============================================================

def latest_price(
    points,
):
    """
    Convert MTGJSON daily price points:

        {
            "2026-09-11": 0.49
        }

    into:

        {
            "price": 0.49,
            "date": "2026-09-11"
        }
    """

    if not points:
        return None

    valid = []

    for date, value in points.items():

        try:

            price = float(
                value
            )

        except (
            TypeError,
            ValueError,
        ):

            continue

        valid.append(
            (
                str(date),
                price,
            )
        )

    if not valid:
        return None

    valid.sort(
        key=lambda item:
            item[0]
    )

    date, price = (
        valid[-1]
    )

    return {
        "price": round(
            price,
            2,
        ),
        "date": date,
    }


def choose_newer_price(
    existing,
    candidate,
):
    """
    Keep the newest price observation.

    If both observations have the same date,
    keep the existing one because they should
    represent the same physical product.
    """

    if candidate is None:
        return existing

    if existing is None:
        return candidate

    existing_date = str(
        existing.get(
            "date",
            "",
        )
    )

    candidate_date = str(
        candidate.get(
            "date",
            "",
        )
    )

    if (
        candidate_date >
        existing_date
    ):

        return candidate

    return existing


def empty_price_record(
    currency="USD",
):
    return {
        "cardkingdom": {
            "currency": (
                currency
                or "USD"
            ),
            "normal": None,
            "foil": None,
            "etched": None,
        },

        "starcitygames": None,
    }


# ============================================================
# IDENTIFIER INDEX
# ============================================================

def build_identifier_index(
    identifier_file,
):
    """
    Build several lookup maps.

    Main goal:

    MTGJSON UUID
        ↓
    exact Scryfall printing

    Plus alternate finish UUIDs:

    mtgjsonNonFoilVersionId
    mtgjsonFoilVersionId

    And Card Kingdom product IDs:

    cardKingdomId
    cardKingdomFoilId
    cardKingdomEtchedId
    """

    print(
        "Building identifier index..."
    )

    cards = {}

    ck_normal_to_uuids = defaultdict(
        set
    )

    ck_foil_to_uuids = defaultdict(
        set
    )

    ck_etched_to_uuids = defaultdict(
        set
    )

    count = 0

    with gzip.open(
        identifier_file,
        "rb",
    ) as file:

        for uuid, card in ijson.kvitems(
            file,
            "data",
        ):

            identifiers = (
                card.get(
                    "identifiers"
                )
                or {}
            )

            scryfall_id = (
                identifiers.get(
                    "scryfallId"
                )
            )

            if not scryfall_id:
                continue

            card_data = {
                "uuid":
                    uuid,

                "scryfall_id":
                    scryfall_id,

                "name":
                    card.get(
                        "name"
                    ),

                "set_code":
                    card.get(
                        "setCode"
                    ),

                "number":
                    card.get(
                        "number"
                    ),

                "finishes":
                    card.get(
                        "finishes"
                    )
                    or [],

                "ck_normal_id":
                    identifiers.get(
                        "cardKingdomId"
                    ),

                "ck_foil_id":
                    identifiers.get(
                        "cardKingdomFoilId"
                    ),

                "ck_etched_id":
                    identifiers.get(
                        "cardKingdomEtchedId"
                    ),

                "nonfoil_uuid":
                    identifiers.get(
                        "mtgjsonNonFoilVersionId"
                    ),

                "foil_uuid":
                    identifiers.get(
                        "mtgjsonFoilVersionId"
                    ),
            }

            cards[
                uuid
            ] = card_data

            ck_normal_id = (
                card_data[
                    "ck_normal_id"
                ]
            )

            ck_foil_id = (
                card_data[
                    "ck_foil_id"
                ]
            )

            ck_etched_id = (
                card_data[
                    "ck_etched_id"
                ]
            )

            if ck_normal_id:

                ck_normal_to_uuids[
                    str(
                        ck_normal_id
                    )
                ].add(
                    uuid
                )

            if ck_foil_id:

                ck_foil_to_uuids[
                    str(
                        ck_foil_id
                    )
                ].add(
                    uuid
                )

            if ck_etched_id:

                ck_etched_to_uuids[
                    str(
                        ck_etched_id
                    )
                ].add(
                    uuid
                )

            count += 1

    print(
        f"Indexed {count:,} "
        f"MTGJSON cards."
    )

    print(
        f"Card Kingdom normal IDs: "
        f"{len(ck_normal_to_uuids):,}"
    )

    print(
        f"Card Kingdom foil IDs: "
        f"{len(ck_foil_to_uuids):,}"
    )

    print(
        f"Card Kingdom etched IDs: "
        f"{len(ck_etched_to_uuids):,}"
    )

    return {
        "cards":
            cards,

        "ck_normal_to_uuids":
            ck_normal_to_uuids,

        "ck_foil_to_uuids":
            ck_foil_to_uuids,

        "ck_etched_to_uuids":
            ck_etched_to_uuids,
    }


# ============================================================
# RAW MTGJSON PRICES
# ============================================================

def load_cardkingdom_prices(
    price_file,
):
    """
    Store CK retail prices by MTGJSON UUID first.

    We resolve them to Scryfall IDs afterward,
    once we can inspect alternative finish UUIDs.
    """

    print(
        "Loading Card Kingdom prices "
        "by MTGJSON UUID..."
    )

    result = {}

    records_read = 0
    records_with_ck = 0

    with gzip.open(
        price_file,
        "rb",
    ) as file:

        for uuid, formats in ijson.kvitems(
            file,
            "data",
        ):

            records_read += 1

            paper = (
                formats.get(
                    "paper"
                )
                or {}
            )

            cardkingdom = (
                paper.get(
                    "cardkingdom"
                )
                or {}
            )

            retail = (
                cardkingdom.get(
                    "retail"
                )
                or {}
            )

            normal = latest_price(
                retail.get(
                    "normal"
                )
            )

            foil = latest_price(
                retail.get(
                    "foil"
                )
            )

            etched = latest_price(
                retail.get(
                    "etched"
                )
            )

            if not any(
                (
                    normal,
                    foil,
                    etched,
                )
            ):
                continue

            records_with_ck += 1

            result[
                uuid
            ] = {
                "currency":
                    cardkingdom.get(
                        "currency"
                    )
                    or "USD",

                "normal":
                    normal,

                "foil":
                    foil,

                "etched":
                    etched,
            }

    print(
        f"MTGJSON price records read: "
        f"{records_read:,}"
    )

    print(
        f"UUIDs with Card Kingdom price: "
        f"{records_with_ck:,}"
    )

    return result


# ============================================================
# UUID PRICE LOOKUP
# ============================================================

def get_uuid_price(
    raw_prices,
    uuid,
    finish,
):
    if not uuid:
        return None

    record = raw_prices.get(
        uuid
    )

    if not record:
        return None

    return record.get(
        finish
    )


def price_from_candidate_uuids(
    raw_prices,
    uuids,
    finish,
):
    """
    Search a small collection of UUIDs that represent
    the same CK product / finish.

    Never crosses to another Scryfall printing unless
    its Card Kingdom identifier explicitly links it.
    """

    result = None

    for uuid in uuids:

        candidate = get_uuid_price(
            raw_prices,
            uuid,
            finish,
        )

        result = choose_newer_price(
            result,
            candidate,
        )

    return result


# ============================================================
# NORMAL RESOLUTION
# ============================================================

def resolve_normal_price(
    card,
    raw_prices,
    identifier_index,
):
    uuid = (
        card[
            "uuid"
        ]
    )

    # 1. Direct UUID
    price = get_uuid_price(
        raw_prices,
        uuid,
        "normal",
    )

    if price:
        return price, "direct"

    # 2. Explicit MTGJSON nonfoil counterpart
    nonfoil_uuid = (
        card.get(
            "nonfoil_uuid"
        )
    )

    price = get_uuid_price(
        raw_prices,
        nonfoil_uuid,
        "normal",
    )

    if price:
        return (
            price,
            "mtgjson_nonfoil_uuid",
        )

    # 3. Same Card Kingdom normal product ID
    ck_id = (
        card.get(
            "ck_normal_id"
        )
    )

    if ck_id:

        candidate_uuids = (
            identifier_index[
                "ck_normal_to_uuids"
            ].get(
                str(
                    ck_id
                ),
                set(),
            )
        )

        price = (
            price_from_candidate_uuids(
                raw_prices,
                candidate_uuids,
                "normal",
            )
        )

        if price:
            return (
                price,
                "cardkingdom_id",
            )

    return None, None


# ============================================================
# FOIL RESOLUTION
# ============================================================

def resolve_foil_price(
    card,
    raw_prices,
    identifier_index,
):
    uuid = (
        card[
            "uuid"
        ]
    )

    # 1. Direct UUID
    price = get_uuid_price(
        raw_prices,
        uuid,
        "foil",
    )

    if price:
        return price, "direct"

    # 2. Explicit MTGJSON foil counterpart
    foil_uuid = (
        card.get(
            "foil_uuid"
        )
    )

    price = get_uuid_price(
        raw_prices,
        foil_uuid,
        "foil",
    )

    if price:
        return (
            price,
            "mtgjson_foil_uuid",
        )

    # Occasionally the foil-specific UUID stores
    # its CK product under normal rather than foil.
    #
    # We only allow this because MTGJSON itself
    # explicitly declares this UUID as the foil
    # counterpart of the same card.
    price = get_uuid_price(
        raw_prices,
        foil_uuid,
        "normal",
    )

    if price:
        return (
            price,
            "mtgjson_foil_uuid_normal_bucket",
        )

    # 3. Same Card Kingdom foil product ID
    ck_id = (
        card.get(
            "ck_foil_id"
        )
    )

    if ck_id:

        candidate_uuids = (
            identifier_index[
                "ck_foil_to_uuids"
            ].get(
                str(
                    ck_id
                ),
                set(),
            )
        )

        price = (
            price_from_candidate_uuids(
                raw_prices,
                candidate_uuids,
                "foil",
            )
        )

        if price:
            return (
                price,
                "cardkingdom_foil_id",
            )

        # Same guarded fallback:
        # this is only among UUIDs that share the
        # exact CK foil product identifier.
        price = (
            price_from_candidate_uuids(
                raw_prices,
                candidate_uuids,
                "normal",
            )
        )

        if price:
            return (
                price,
                "cardkingdom_foil_id_normal_bucket",
            )

    return None, None


# ============================================================
# ETCHED RESOLUTION
# ============================================================

def resolve_etched_price(
    card,
    raw_prices,
    identifier_index,
):
    uuid = (
        card[
            "uuid"
        ]
    )

    # 1. Direct UUID
    price = get_uuid_price(
        raw_prices,
        uuid,
        "etched",
    )

    if price:
        return price, "direct"

    # 2. Card Kingdom etched product ID
    ck_id = (
        card.get(
            "ck_etched_id"
        )
    )

    if ck_id:

        candidate_uuids = (
            identifier_index[
                "ck_etched_to_uuids"
            ].get(
                str(
                    ck_id
                ),
                set(),
            )
        )

        price = (
            price_from_candidate_uuids(
                raw_prices,
                candidate_uuids,
                "etched",
            )
        )

        if price:
            return (
                price,
                "cardkingdom_etched_id",
            )

    return None, None


# ============================================================
# RESOLVE TO SCRYFALL IDs
# ============================================================

def build_scryfall_prices(
    identifier_index,
    raw_prices,
):
    print()
    print(
        "Resolving CK prices to "
        "exact Scryfall printings..."
    )

    cards = {}

    stats = defaultdict(
        int
    )

    source_stats = defaultdict(
        int
    )

    indexed_cards = (
        identifier_index[
            "cards"
        ]
    )

    for uuid, card in indexed_cards.items():

        scryfall_id = (
            card.get(
                "scryfall_id"
            )
        )

        if not scryfall_id:
            continue

        normal, normal_source = (
            resolve_normal_price(
                card,
                raw_prices,
                identifier_index,
            )
        )

        foil, foil_source = (
            resolve_foil_price(
                card,
                raw_prices,
                identifier_index,
            )
        )

        etched, etched_source = (
            resolve_etched_price(
                card,
                raw_prices,
                identifier_index,
            )
        )

        if not any(
            (
                normal,
                foil,
                etched,
            )
        ):
            continue

        if scryfall_id not in cards:

            cards[
                scryfall_id
            ] = empty_price_record()

        ck = (
            cards[
                scryfall_id
            ][
                "cardkingdom"
            ]
        )

        ck[
            "normal"
        ] = choose_newer_price(
            ck.get(
                "normal"
            ),
            normal,
        )

        ck[
            "foil"
        ] = choose_newer_price(
            ck.get(
                "foil"
            ),
            foil,
        )

        ck[
            "etched"
        ] = choose_newer_price(
            ck.get(
                "etched"
            ),
            etched,
        )

        if normal:
            stats[
                "normal"
            ] += 1

        if foil:
            stats[
                "foil"
            ] += 1

        if etched:
            stats[
                "etched"
            ] += 1

        if normal_source:
            source_stats[
                f"normal:{normal_source}"
            ] += 1

        if foil_source:
            source_stats[
                f"foil:{foil_source}"
            ] += 1

        if etched_source:
            source_stats[
                f"etched:{etched_source}"
            ] += 1

    print(
        f"Unique Scryfall printings "
        f"with CK prices: "
        f"{len(cards):,}"
    )

    print(
        f"Normal mappings: "
        f"{stats['normal']:,}"
    )

    print(
        f"Foil mappings: "
        f"{stats['foil']:,}"
    )

    print(
        f"Etched mappings: "
        f"{stats['etched']:,}"
    )

    print()
    print(
        "Resolution sources:"
    )

    for key in sorted(
        source_stats
    ):

        print(
            f"  {key}: "
            f"{source_stats[key]:,}"
        )

    return cards


# ============================================================
# TARGET DEBUGGING
# ============================================================

def debug_target_card(
    identifier_index,
    raw_prices,
    target_set="SOS",
    target_number="367",
):
    """
    Print everything relevant for our known problem card.

    This lets us see exactly what MTGJSON contains for:

        Witherbloom Charm
        SOS #367

    The workflow log becomes our debugging tool.
    """

    print()
    print(
        "=" * 60
    )

    print(
        f"DEBUG TARGET: "
        f"{target_set} #{target_number}"
    )

    print(
        "=" * 60
    )

    found = False

    for uuid, card in (
        identifier_index[
            "cards"
        ].items()
    ):

        set_code = str(
            card.get(
                "set_code"
            )
            or ""
        ).upper()

        number = str(
            card.get(
                "number"
            )
            or ""
        )

        if (
            set_code !=
            target_set.upper()
        ):
            continue

        if (
            number !=
            str(
                target_number
            )
        ):
            continue

        found = True

        print()
        print(
            f"Name: "
            f"{card.get('name')}"
        )

        print(
            f"UUID: "
            f"{uuid}"
        )

        print(
            f"Scryfall ID: "
            f"{card.get('scryfall_id')}"
        )

        print(
            f"Finishes: "
            f"{card.get('finishes')}"
        )

        print(
            f"CK normal ID: "
            f"{card.get('ck_normal_id')}"
        )

        print(
            f"CK foil ID: "
            f"{card.get('ck_foil_id')}"
        )

        print(
            f"CK etched ID: "
            f"{card.get('ck_etched_id')}"
        )

        print(
            f"MTGJSON nonfoil UUID: "
            f"{card.get('nonfoil_uuid')}"
        )

        print(
            f"MTGJSON foil UUID: "
            f"{card.get('foil_uuid')}"
        )

        print(
            f"Direct raw prices: "
            f"{raw_prices.get(uuid)}"
        )

        if card.get(
            "nonfoil_uuid"
        ):

            print(
                "Nonfoil counterpart prices: "
                f"{raw_prices.get(card['nonfoil_uuid'])}"
            )

        if card.get(
            "foil_uuid"
        ):

            print(
                "Foil counterpart prices: "
                f"{raw_prices.get(card['foil_uuid'])}"
            )

        normal, normal_source = (
            resolve_normal_price(
                card,
                raw_prices,
                identifier_index,
            )
        )

        foil, foil_source = (
            resolve_foil_price(
                card,
                raw_prices,
                identifier_index,
            )
        )

        etched, etched_source = (
            resolve_etched_price(
                card,
                raw_prices,
                identifier_index,
            )
        )

        print(
            f"Resolved normal: "
            f"{normal} "
            f"via {normal_source}"
        )

        print(
            f"Resolved foil: "
            f"{foil} "
            f"via {foil_source}"
        )

        print(
            f"Resolved etched: "
            f"{etched} "
            f"via {etched_source}"
        )

    if not found:

        print(
            "Target card was NOT found "
            "in AllIdentifiers."
        )

    print(
        "=" * 60
    )


# ============================================================
# OUTPUT
# ============================================================

def write_output(
    cards,
):
    os.makedirs(
        os.path.dirname(
            OUTPUT_FILE
        ),
        exist_ok=True,
    )

    output = {
        "meta": {
            "generated_at": (
                datetime.now(
                    timezone.utc
                )
                .replace(
                    microsecond=0
                )
                .isoformat()
            ),

            "currency":
                "USD",

            "cardkingdom_source":
                "MTGJSON",

            "starcitygames_source":
                None,

            "mapping_version":
                "ck-identifiers-v3",
        },

        "cards":
            cards,
    }

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            output,
            file,
            ensure_ascii=False,
            separators=(
                ",",
                ":",
            ),
        )

    size_mb = (
        os.path.getsize(
            OUTPUT_FILE
        )
        / 1024
        / 1024
    )

    print()
    print(
        f"Wrote "
        f"{OUTPUT_FILE}"
    )

    print(
        f"Unique priced "
        f"Scryfall IDs: "
        f"{len(cards):,}"
    )

    print(
        f"Output size: "
        f"{size_mb:.2f} MB"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    with tempfile.TemporaryDirectory() as temp:

        identifiers_file = (
            os.path.join(
                temp,
                "AllIdentifiers.json.gz",
            )
        )

        prices_file = (
            os.path.join(
                temp,
                "AllPricesToday.json.gz",
            )
        )

        download(
            IDENTIFIERS_URL,
            identifiers_file,
        )

        download(
            PRICES_URL,
            prices_file,
        )

        identifier_index = (
            build_identifier_index(
                identifiers_file
            )
        )

        raw_prices = (
            load_cardkingdom_prices(
                prices_file
            )
        )

        # ----------------------------------------------------
        # DEBUG OUR KNOWN PROBLEM CARD
        # ----------------------------------------------------

        debug_target_card(
            identifier_index,
            raw_prices,
            target_set="SOS",
            target_number="367",
        )

        cards = (
            build_scryfall_prices(
                identifier_index,
                raw_prices,
            )
        )

        write_output(
            cards
        )


if __name__ == "__main__":
    main()