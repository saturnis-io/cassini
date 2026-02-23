"""OpenSPC Bridge CLI — RS-232/USB gage to MQTT bridge agent."""
import argparse
import sys


def cmd_list_ports(args):
    """List available serial ports."""
    import serial.tools.list_ports
    ports = serial.tools.list_ports.comports()
    if not ports:
        print("No serial ports found.")
        return
    for p in ports:
        print(f"  {p.device:20s}  {p.description}")


def cmd_test_port(args):
    """Test reading from a serial port."""
    from openspc_bridge.parsers import create_parser
    from openspc_bridge.serial_reader import SerialReader

    parser = create_parser(args.profile, args.pattern)
    reader = SerialReader(args.port, baud_rate=args.baud)

    print(f"Testing {args.port} at {args.baud} baud (profile: {args.profile})...")
    print("Waiting for data (Ctrl+C to stop)...\n")

    reader.open()
    count = 0
    try:
        while count < args.count:
            line = reader.readline()
            if line:
                value = parser.parse(line)
                status = f"-> {value}" if value is not None else "-> [PARSE FAILED]"
                print(f"  Raw: {line!r:40s} {status}")
                count += 1
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        reader.close()


def cmd_run(args):
    """Run the bridge agent."""
    from openspc_bridge.runner import run_bridge

    run_bridge(
        server_url=args.server,
        api_key=args.api_key,
        config_file=args.config,
    )


def main():
    ap = argparse.ArgumentParser(prog="openspc-bridge", description="OpenSPC Gage Bridge Agent")
    sub = ap.add_subparsers(dest="command", required=True)

    sub.add_parser("list-ports", help="List available serial ports")

    tp = sub.add_parser("test-port", help="Test reading from a serial port")
    tp.add_argument("port", help="Serial port (e.g. COM3, /dev/ttyUSB0)")
    tp.add_argument("--baud", type=int, default=9600)
    tp.add_argument("--profile", default="mitutoyo_digimatic", choices=["mitutoyo_digimatic", "generic"])
    tp.add_argument("--pattern", default=None, help="Regex pattern for generic profile")
    tp.add_argument("--count", type=int, default=5, help="Number of readings to capture")

    rp = sub.add_parser("run", help="Run the bridge agent")
    rp.add_argument("--server", help="OpenSPC server URL")
    rp.add_argument("--api-key", help="Bridge API key")
    rp.add_argument("--config", help="Local YAML config file (alternative to server)")

    parsed = ap.parse_args()

    if parsed.command == "list-ports":
        cmd_list_ports(parsed)
    elif parsed.command == "test-port":
        cmd_test_port(parsed)
    elif parsed.command == "run":
        cmd_run(parsed)


if __name__ == "__main__":
    main()
