import re
import ipaddress
from urllib.parse import urlparse
import tldextract

_OOS_PREFIXES = ("!", "-", "not in scope", "out of scope", "exclude", "excluded")
_URL_RE = re.compile(r"^https?://", re.IGNORECASE)
_CIDR_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}/\d{1,2}$")
_IP_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
_WILDCARD_RE = re.compile(r"^\*\.")
_DOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$", re.IGNORECASE)


def parse_scope(raw_text: str) -> dict[str, list[str]]:
    in_scope: list[str] = []
    out_of_scope: list[str] = []

    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        is_oos = False
        lower = line.lower()
        for prefix in _OOS_PREFIXES:
            if lower.startswith(prefix):
                is_oos = True
                line = line.lstrip("!-").strip()
                for kw in ("not in scope", "out of scope", "exclude", "excluded"):
                    if line.lower().startswith(kw):
                        line = line[len(kw):].strip().lstrip(":").strip()
                break

        if line.startswith("*."):
            target = _canonicalize(line)
        elif _URL_RE.match(line):
            target = _canonicalize(line)
        else:
            line = re.split(r"\s+#", line)[0].strip()
            target = _canonicalize(line)

        if target:
            (out_of_scope if is_oos else in_scope).append(target)

    return {"in_scope": deduplicate(in_scope), "out_of_scope": deduplicate(out_of_scope)}


def _canonicalize(raw: str) -> str | None:
    raw = raw.strip().rstrip("/")

    if _URL_RE.match(raw):
        try:
            parsed = urlparse(raw)
            return f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            return raw

    if _CIDR_RE.match(raw):
        try:
            net = ipaddress.ip_network(raw, strict=False)
            return str(net)
        except ValueError:
            pass

    if _IP_RE.match(raw):
        try:
            ipaddress.ip_address(raw)
            return raw
        except ValueError:
            pass

    if raw.startswith("*."):
        base = raw[2:]
        ext = tldextract.extract(base)
        if ext.domain and ext.suffix:
            return f"*.{ext.domain}.{ext.suffix}"
        return raw

    raw_lower = raw.lower()
    if _DOMAIN_RE.match(raw_lower):
        ext = tldextract.extract(raw_lower)
        if ext.domain and ext.suffix:
            return f"{ext.subdomain}.{ext.domain}.{ext.suffix}".lstrip(".")
        return raw_lower

    return None


def deduplicate(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def extract_root_domains(targets: list[str]) -> list[str]:
    roots: set[str] = set()
    for t in targets:
        if t.startswith("*."):
            t = t[2:]
        if _URL_RE.match(t):
            t = urlparse(t).hostname or ""
        if _CIDR_RE.match(t) or _IP_RE.match(t):
            continue
        ext = tldextract.extract(t)
        if ext.domain and ext.suffix:
            roots.add(f"{ext.domain}.{ext.suffix}")
    return sorted(roots)


def classify_target(value: str) -> str:
    if value.startswith("*."):
        return "wildcard"
    if _CIDR_RE.match(value):
        return "cidr"
    if _IP_RE.match(value):
        return "ip"
    if _URL_RE.match(value):
        return "url"
    return "domain"
