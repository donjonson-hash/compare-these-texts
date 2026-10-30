"""Add social sharing metadata to website output only, after offline ZIP packaging."""
from html.parser import HTMLParser
import html

SITE_NAME = "Compare Two Texts"
IMAGE = "https://comparetwotexts.pro/images/og-1200x630.png"
# Marks home-page markup that belongs to the website, never to offline extensions.
WEBSITE_ONLY = ("<!-- website-only -->", "<!-- /website-only -->")


class _Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = None; self.description = None; self.canonical = None; self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title": self._in_title = True; self.title = ""
        if tag == "meta" and a.get("name") == "description": self.description = a.get("content")
        if tag == "link" and a.get("rel") == "canonical": self.canonical = a.get("href")

    def handle_endtag(self, tag):
        if tag == "title": self._in_title = False

    def handle_data(self, data):
        if self._in_title: self.title += data


def social_meta(text):
    """Derive Open Graph tags from the page's own title, description and canonical URL."""
    head = _Head(); head.feed(text)
    if not (head.title and head.description and head.canonical):
        raise RuntimeError("Social metadata needs a title, description and canonical URL")
    tags = [("property", "og:type", "website"), ("property", "og:site_name", SITE_NAME),
            ("property", "og:title", head.title), ("property", "og:description", head.description),
            ("property", "og:url", head.canonical), ("property", "og:image", IMAGE),
            ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"),
            ("property", "og:image:alt", "Two document versions compared side by side with differences highlighted"),
            ("name", "twitter:card", "summary_large_image")]
    return "".join(f'<meta {kind}="{key}" content="{html.escape(value)}">' for kind, key, value in tags)


def add_social_meta(output):
    for page in sorted(output.rglob("*.html")):
        text = page.read_text()
        if 'property="og:' in text:
            raise RuntimeError(f"Duplicate social metadata in {page}")
        if text.count("</head>") != 1:
            raise RuntimeError(f"Expected one head in {page}")
        page.write_text(text.replace("</head>", social_meta(text) + "</head>"))
