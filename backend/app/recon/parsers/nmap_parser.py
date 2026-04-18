"""Parse nmap XML output via libnmap."""
from pathlib import Path

try:
    from libnmap.parser import NmapParser
    HAS_LIBNMAP = True
except ImportError:
    HAS_LIBNMAP = False


def parse_nmap_xml(file_path: str) -> list[dict]:
    path = Path(file_path)
    if not path.exists():
        return []

    if not HAS_LIBNMAP:
        return _parse_nmap_xml_fallback(file_path)

    try:
        report = NmapParser.parse_fromfile(str(path))
    except Exception:
        return []

    results = []
    for host in report.hosts:
        for svc in host.services:
            if svc.state != "open":
                continue
            results.append({
                "host": host.address,
                "port": svc.port,
                "protocol": svc.protocol,
                "service": svc.service,
                "product": svc.banner,
                "state": svc.state,
            })
    return results


def _parse_nmap_xml_fallback(file_path: str) -> list[dict]:
    import xmltodict
    try:
        with open(file_path) as f:
            data = xmltodict.parse(f.read())
    except Exception:
        return []

    results = []
    hosts = data.get("nmaprun", {}).get("host") or []
    if isinstance(hosts, dict):
        hosts = [hosts]

    for host in hosts:
        addr = ""
        addresses = host.get("address") or []
        if isinstance(addresses, dict):
            addresses = [addresses]
        for a in addresses:
            if a.get("@addrtype") == "ipv4":
                addr = a.get("@addr", "")
                break

        ports = host.get("ports", {}).get("port") or []
        if isinstance(ports, dict):
            ports = [ports]

        for port in ports:
            state = port.get("state", {}).get("@state", "")
            if state != "open":
                continue
            svc = port.get("service", {})
            results.append({
                "host": addr,
                "port": int(port.get("@portid", 0)),
                "protocol": port.get("@protocol", ""),
                "service": svc.get("@name", ""),
                "product": svc.get("@product", ""),
                "state": state,
            })

    return results
