"""Example demonstrating WebSocket functionality.

This script shows how to connect to the OpenSPC WebSocket endpoint,
subscribe to characteristics, and receive real-time updates.
"""

import asyncio
import json

import websockets


async def websocket_client_example():
    """Example WebSocket client demonstrating the protocol."""
    uri = "ws://localhost:8000/ws"

    print("Connecting to WebSocket endpoint...")
    async with websockets.connect(uri) as websocket:
        print("Connected!")

        # Subscribe to characteristic updates
        print("\nSubscribing to characteristics 1 and 2...")
        subscribe_message = {
            "type": "subscribe",
            "characteristic_ids": [1, 2]
        }
        await websocket.send(json.dumps(subscribe_message))

        # Wait for subscription confirmation
        response = await websocket.recv()
        print(f"Subscription response: {response}")

        # Send ping to test heartbeat
        print("\nSending ping...")
        ping_message = {"type": "ping"}
        await websocket.send(json.dumps(ping_message))

        # Wait for pong
        response = await websocket.recv()
        print(f"Heartbeat response: {response}")

        # Listen for updates for 30 seconds
        print("\nListening for updates (30 seconds)...")
        print("Try submitting samples via the API while this is running!")
        print("Example: POST /api/v1/samples with characteristic_id=1 or 2")

        try:
            while True:
                # Set a timeout so we can exit gracefully
                response = await asyncio.wait_for(websocket.recv(), timeout=30.0)
                message = json.loads(response)

                if message["type"] == "sample":
                    payload = message["payload"]
                    print(f"\n📊 New Sample Received:")
                    print(f"   Characteristic: {payload['characteristic_id']}")
                    print(f"   Sample ID: {payload['sample_id']}")
                    print(f"   Value: {payload['value']}")
                    print(f"   Zone: {payload['zone']}")
                    print(f"   In Control: {payload['in_control']}")

                elif message["type"] == "violation":
                    payload = message["payload"]
                    print(f"\n⚠️  Violation Detected:")
                    print(f"   Characteristic: {payload['characteristic_id']}")
                    print(f"   Violation ID: {payload['violation_id']}")
                    print(f"   Rule: {payload['rule_name']} (Rule {payload['rule_id']})")
                    print(f"   Severity: {payload['severity']}")

                elif message["type"] == "ack_update":
                    payload = message["payload"]
                    print(f"\n✓ Acknowledgment Update:")
                    print(f"   Violation ID: {payload['violation_id']}")
                    print(f"   Acknowledged: {payload['acknowledged']}")
                    if payload.get("ack_user"):
                        print(f"   User: {payload['ack_user']}")
                    if payload.get("ack_reason"):
                        print(f"   Reason: {payload['ack_reason']}")

                elif message["type"] == "pong":
                    print("🏓 Pong received")

                else:
                    print(f"\nUnknown message type: {message}")

        except asyncio.TimeoutError:
            print("\n\nTimeout reached. Closing connection...")

        # Unsubscribe before disconnecting
        print("\nUnsubscribing from characteristic 1...")
        unsubscribe_message = {
            "type": "unsubscribe",
            "characteristic_ids": [1]
        }
        await websocket.send(json.dumps(unsubscribe_message))

        # Wait for unsubscribe confirmation
        response = await websocket.recv()
        print(f"Unsubscribe response: {response}")

        print("\nDisconnecting...")


async def multiple_clients_example():
    """Example showing multiple clients subscribing to different characteristics."""
    uri = "ws://localhost:8000/ws"

    async def client(name: str, char_ids: list[int]):
        """Individual client task."""
        print(f"[{name}] Connecting...")
        async with websockets.connect(uri) as websocket:
            print(f"[{name}] Connected!")

            # Subscribe
            subscribe_message = {
                "type": "subscribe",
                "characteristic_ids": char_ids
            }
            await websocket.send(json.dumps(subscribe_message))
            response = await websocket.recv()
            print(f"[{name}] Subscribed to characteristics {char_ids}")

            # Listen for updates
            try:
                while True:
                    response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                    message = json.loads(response)
                    if message["type"] in ["sample", "violation", "ack_update"]:
                        print(f"[{name}] Received {message['type']} update")
            except asyncio.TimeoutError:
                print(f"[{name}] Timeout, disconnecting...")

    # Run multiple clients concurrently
    await asyncio.gather(
        client("Client A", [1]),
        client("Client B", [2]),
        client("Client C", [1, 2]),  # Subscribe to multiple characteristics
    )


async def heartbeat_example():
    """Example demonstrating heartbeat/ping-pong mechanism."""
    uri = "ws://localhost:8000/ws"

    async with websockets.connect(uri) as websocket:
        print("Connected! Sending periodic pings...")

        for i in range(10):
            print(f"\nPing {i + 1}/10...")
            ping_message = {"type": "ping"}
            await websocket.send(json.dumps(ping_message))

            response = await websocket.recv()
            message = json.loads(response)

            if message["type"] == "pong":
                print("✓ Pong received")
            else:
                print(f"Unexpected response: {message}")

            # Wait 5 seconds between pings
            await asyncio.sleep(5)

        print("\nHeartbeat test complete!")


if __name__ == "__main__":
    print("=" * 70)
    print("OpenSPC WebSocket Client Examples")
    print("=" * 70)
    print("\nMake sure the OpenSPC server is running:")
    print("  uvicorn openspc.main:app --reload")
    print("\nAvailable examples:")
    print("  1. Basic client (default)")
    print("  2. Multiple clients")
    print("  3. Heartbeat test")
    print("=" * 70)

    # Run the basic example by default
    # Uncomment others to test different scenarios
    try:
        asyncio.run(websocket_client_example())
        # asyncio.run(multiple_clients_example())
        # asyncio.run(heartbeat_example())
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except ConnectionRefusedError:
        print("\n\nError: Could not connect to server.")
        print("Make sure the OpenSPC server is running:")
        print("  uvicorn openspc.main:app --reload")
    except Exception as e:
        print(f"\n\nError: {e}")
