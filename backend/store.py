"""The shop floor: which aisle each section is in (shown on product pages, the shopping list
and the store map). Change the numbers here to match the real shop."""
AISLES = {
    "Stationery": 1,
    "Snacks": 2,
    "Biscuits & Chocolates": 3,
    "Beverages": 4,
    "Instant Food": 5,
    "Personal Care": 6,
    "Household": 7,
    "Electronics & Hobby": 8,
}


def aisle_for(category):
    return AISLES.get(category)
