import gzip
import json
import os
import tempfile
import urllib.request
from datetime import datetime, timezone

import ijson


MTGJSON_BASE = "https://mtgjson.com/api/v5"

IDENTIFIERS_URL = f"{MTGJSON_BASE}/AllIdentifiers.json.gz"
PRICES_URL = f"{MTGJSON_BASE}/AllPricesToday.json.gz"

OUTPUT_FILE = os.path.join("data", "prices.json")


def download(url, destination):
    print(f"Downloading: {url}")

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "mtg-collection-manager/1.0 "
                "(GitHub price updater)"
            )
        },
    )

    with urllib.request.urlopen(request) as response:
        with open(destination, "wb") as output:
            while True:
                chunk = response.read(1024 * 1024)

                if not chunk:
                    break

                output.write(chunk)

    print(f"Saved: {destination}")


def latest_price(points):
    if not points:
        return None

    valid = []

    for date, value in points.items():
        try:
            price = float(value)
        except (TypeError, ValueError):
            continue

        valid.append(
            (
                date,
                price,
            )
        )

    if not valid:
        return None

    valid.sort(
        key=lambda item: item[0]
    )

    date, price = valid[-1]

    return {
        "price": round(price, 2),
        "date": date,
    }


def build_uuid_to_scryfall(identifier_file):
    print(
        "Building MTGJSON UUID → Scryfall ID map..."
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
                card.get("identifiers")
                or {}
            )

            scryfall_id = identifiers.get(
                "scryfallId"
            )

            if not scryfall_id:
                continue

            result[uuid] = scryfall_id

    print(
        f"Mapped {len(result):,} cards."
    )

    return result


def extract_cardkingdom_prices(
    price_file,
    uuid_to_scryfall,
):
    print(
        "Extracting Card Kingdom retail prices..."
    )

    cards = {}

    priced_cards = 0

    with gzip.open(
        price_file,
        "rb",
    ) as file:
        for uuid, formats in ijson.kvitems(
            file,
            "data",
        ):
            scryfall_id = uuid_to_scryfall.get(
                uuid
            )

            if not scryfall_id:
                continue

            paper = (
                formats.get("paper")
                or {}
            )

            cardkingdom = (
                paper.get("cardkingdom")
                or {}
            )

            retail = (
                cardkingdom.get("retail")
                or {}
            )

            normal = latest_price(
                retail.get("normal")
            )

            foil = latest_price(
                retail.get("foil")
            )

            etched = latest_price(
                retail.get("etched")
            )

            if not any(
                (
                    normal,
                    foil,
                    etched,
                )
            ):
                continue

            cards[scryfall_id] = {
                "cardkingdom": {
                    "currency": (
                        cardkingdom.get(
                            "currency"
                        )
                        or "USD"
                    ),
                    "normal": normal,
                    "foil": foil,
                    "etched": etched,
                },

                # Reserved for the future SCG
                # authorized price provider.
                # We intentionally do not scrape SCG.
                "starcitygames": None,
            }

            priced_cards += 1

    print(
        f"Found Card Kingdom prices for "
        f"{priced_cards:,} printings."
    )

    return cards


def write_output(cards):
    os.makedirs(
        os.path.dirname(OUTPUT_FILE),
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
            "currency": "USD",
            "cardkingdom_source": (
                "MTGJSON"
            ),
            "starcitygames_source": None,
        },
        "cards": cards,
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

    print(
        f"Wrote {OUTPUT_FILE}"
    )

    print(
        f"Output size: "
        f"{size_mb:.2f} MB"
    )


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