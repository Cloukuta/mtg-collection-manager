import gzip
import json
import os
import tempfile
import urllib.request
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
    MTGJSON price points are generally:

        {
            "2026-09-11": 0.49
        }

    Return the newest valid value.
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
    Merge two price observations.

    This matters because multiple MTGJSON UUID records
    can ultimately map to the same Scryfall printing.

    We do NOT want one UUID to erase normal/foil/etched
    information previously found for that printing.
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
        candidate_date
        >=
        existing_date
    ):

        return candidate


    return existing


# ============================================================
# IDENTIFIERS
# ============================================================

def build_uuid_to_scryfall(
    identifier_file,
):
    print(
        "Building MTGJSON UUID → "
        "Scryfall ID map..."
    )


    result = {}


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


            result[
                uuid
            ] = (
                scryfall_id
            )


    print(
        f"Mapped "
        f"{len(result):,} "
        f"MTGJSON UUIDs."
    )


    return result


# ============================================================
# CARD KINGDOM
# ============================================================

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

        # Reserved for future authorized
        # Star City Games source.
        #
        # We intentionally do not scrape SCG.
        "starcitygames": None,
    }


def merge_cardkingdom_record(
    cards,
    scryfall_id,
    currency,
    normal,
    foil,
    etched,
):
    """
    Merge price information instead of replacing
    the complete Scryfall record.

    Example:

      MTGJSON UUID A
        Scryfall X
        normal = $0.49

      MTGJSON UUID B
        Scryfall X
        foil = $1.99

    Old behavior could leave us with only one.

    New behavior becomes:

      Scryfall X
        normal = $0.49
        foil   = $1.99
    """

    if (
        scryfall_id
        not in cards
    ):

        cards[
            scryfall_id
        ] = empty_price_record(
            currency
        )


    record = (
        cards[
            scryfall_id
        ]
    )


    ck = (
        record[
            "cardkingdom"
        ]
    )


    if currency:
        ck[
            "currency"
        ] = currency


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


def extract_cardkingdom_prices(
    price_file,
    uuid_to_scryfall,
):
    print(
        "Extracting Card Kingdom "
        "retail prices..."
    )


    cards = {}


    mtgjson_price_records = 0
    mapped_price_records = 0
    merged_records = 0

    normal_count = 0
    foil_count = 0
    etched_count = 0


    seen_scryfall_ids = set()


    with gzip.open(
        price_file,
        "rb",
    ) as file:

        for uuid, formats in ijson.kvitems(
            file,
            "data",
        ):

            mtgjson_price_records += 1


            scryfall_id = (
                uuid_to_scryfall.get(
                    uuid
                )
            )


            if not scryfall_id:
                continue


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


            mapped_price_records += 1


            if (
                scryfall_id
                in seen_scryfall_ids
            ):

                merged_records += 1


            seen_scryfall_ids.add(
                scryfall_id
            )


            if normal:
                normal_count += 1

            if foil:
                foil_count += 1

            if etched:
                etched_count += 1


            merge_cardkingdom_record(
                cards=cards,

                scryfall_id=(
                    scryfall_id
                ),

                currency=(
                    cardkingdom.get(
                        "currency"
                    )
                    or "USD"
                ),

                normal=normal,
                foil=foil,
                etched=etched,
            )


    print()
    print(
        "Card Kingdom extraction:"
    )

    print(
        f"  MTGJSON price records read: "
        f"{mtgjson_price_records:,}"
    )

    print(
        f"  CK records mapped: "
        f"{mapped_price_records:,}"
    )

    print(
        f"  Duplicate Scryfall mappings "
        f"merged: "
        f"{merged_records:,}"
    )

    print(
        f"  Unique Scryfall printings "
        f"with CK price: "
        f"{len(cards):,}"
    )

    print(
        f"  Normal observations: "
        f"{normal_count:,}"
    )

    print(
        f"  Foil observations: "
        f"{foil_count:,}"
    )

    print(
        f"  Etched observations: "
        f"{etched_count:,}"
    )


    return cards


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

            
            # This is intentionally represented below
            # using a normal Python string key/value.
            
        },

        "cards":
            cards,
    }


    # Add build information separately so that
    # prices.js can ignore it safely.
    output[
        "meta"
    ][
        "mapping_version"
    ] = (
        "scryfall-id-merged-v2"
    )


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

        identifiers_file = os.path.join(
            temp,
            "AllIdentifiers.json.gz",
        )


        prices_file = os.path.join(
            temp,
            "AllPricesToday.json.gz",
        )


        download(
            IDENTIFIERS_URL,
            identifiers_file,
        )


        download(
            PRICES_URL,
            prices_file,
        )


        uuid_to_scryfall = (
            build_uuid_to_scryfall(
                identifiers_file
            )
        )


        cards = (
            extract_cardkingdom_prices(
                prices_file,
                uuid_to_scryfall,
            )
        )


        write_output(
            cards
        )


if __name__ == "__main__":
    main()