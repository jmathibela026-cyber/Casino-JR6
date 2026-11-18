"""Cryptographically secure European roulette pocket reference.

This generates independent, uniform electronic draws. It is not a physical
wheel simulator and does not predict future wheel outcomes.
"""

import secrets

POCKET_COUNT = 37
RED_NUMBERS = frozenset({
    1, 3, 5, 7, 9, 12, 14, 16, 18,
    19, 21, 23, 25, 27, 30, 32, 34, 36,
})


def spin_european_roulette() -> dict[str, int | str]:
    """Return a uniformly selected European pocket and its classifications."""
    pocket = secrets.randbelow(POCKET_COUNT)
    return {
        "pocket": pocket,
        "color": "green" if pocket == 0 else ("red" if pocket in RED_NUMBERS else "black"),
        "parity": "zero" if pocket == 0 else ("even" if pocket % 2 == 0 else "odd"),
        "dozen": "zero" if pocket == 0 else (pocket - 1) // 12 + 1,
        "column": "zero" if pocket == 0 else (pocket - 1) % 3 + 1,
    }


if __name__ == "__main__":
    print(spin_european_roulette())
