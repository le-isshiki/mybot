from .nuclei_parser import parse_nuclei_jsonl
from .httpx_parser import parse_httpx_jsonl
from .nmap_parser import parse_nmap_xml

PARSERS = {
    "nuclei_jsonl": parse_nuclei_jsonl,
    "httpx_jsonl": parse_httpx_jsonl,
    "nmap_xml": parse_nmap_xml,
}

__all__ = ["parse_nuclei_jsonl", "parse_httpx_jsonl", "parse_nmap_xml", "PARSERS"]
