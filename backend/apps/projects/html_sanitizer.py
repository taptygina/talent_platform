import bleach
from bleach.css_sanitizer import CSSSanitizer

ALLOWED_TAGS = [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "a",
    "img",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title"],
    "p": ["style"],
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto", "data"]
CSS_SANITIZER = CSSSanitizer(allowed_css_properties=["text-align"])


def sanitize_html(source: str) -> str:
    cleaned = bleach.clean(
        source or "",
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=CSS_SANITIZER,
        strip=True,
    )
    return bleach.linkify(cleaned)
