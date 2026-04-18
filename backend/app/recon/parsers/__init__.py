from .nuclei_parser import parse_nuclei_jsonl
from .httpx_parser import parse_httpx_jsonl
from .nmap_parser import parse_nmap_xml
from .trufflehog_parser import parse_trufflehog_json

PARSERS = {
    "nuclei_jsonl": parse_nuclei_jsonl,
    "httpx_jsonl": parse_httpx_jsonl,
    "nmap_xml": parse_nmap_xml,
    "trufflehog_json": parse_trufflehog_json,
}

__all__ = ["parse_nuclei_jsonl", "parse_httpx_jsonl", "parse_nmap_xml", "parse_trufflehog_json", "PARSERS"]
