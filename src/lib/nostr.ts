import {
  EventTemplate,
  SimplePool,
  finalizeEvent,
  getPublicKey,
  nip19,
} from "nostr-tools";

type HexString<Length extends number> = `0x${string}` & { length: Length };
export type Address = HexString<42>;

type BitcoinAddress =
  | `1${string}` // Legacy addresses
  | `3${string}` // P2SH addresses
  | `bc1${string}`; // Native SegWit addresses

export type TxHash = HexString<66>;
export type TxId = HexString<64>;
export type ChainId = number;
export type Blockchain = "ethereum" | "bitcoin";
export type AddressType = "address" | "tx";
export type URI =
  | `ethereum:${ChainId}:address:${Address}`
  | `ethereum:${ChainId}:tx:${TxHash}`
  | `bitcoin:address:${BitcoinAddress}`
  | `bitcoin:tx:${TxId}`;

const getKindFromURI = (uri: URI): string => {
  const type = uri.match(/:tx:/) ? "tx" : "address";
  const blockchain = uri.startsWith("bitcoin") ? "bitcoin" : "ethereum";
  return `${blockchain}:${type}`;
};

export class Nostr {
  private static instance: Nostr | null = null;
  private pool: SimplePool;

  private constructor(
    private readonly nsec?: string,
    readonly relays?: string[]
  ) {
    this.nsec = nsec || process.env.NOSTR_NSEC;
    this.relays = relays || [
      "wss://nostr-pub.wellorder.net",
      "wss://nostr.swiss-enigma.ch",
      "wss://relay.nostr.band",
      "wss://relay.damus.io",
    ];
    this.pool = new SimplePool();

    this.relays.forEach(async (url) => {
      try {
        await this.pool.ensureRelay(url, {
          // Add WebSocket options
          connectionTimeout: 3000, // 3 seconds timeout
        });
        console.log(`>>> NostrProvider connected to ${url}`);
      } catch (err) {
        console.warn(`Failed to connect to ${url}:`, err);
        // Continue with other relays even if one fails
      }
    });
  }

  static getInstance(nsec?: string, relays?: string[]): Nostr {
    if (!nsec && !process.env.NOSTR_NSEC) {
      return null;
    }
    if (!Nostr.instance) {
      Nostr.instance = new Nostr(nsec, relays);
    }
    return Nostr.instance;
  }

  getPublicKey() {
    if (!this.nsec) {
      throw new Error("Nostr: No nsec provided");
    }
    const { data: secretKey } = nip19.decode(this.nsec);
    const pubkey = getPublicKey(secretKey as Uint8Array);
    return pubkey;
  }

  getNpub() {
    return nip19.npubEncode(this.getPublicKey());
  }

  async publishMetadata(
    uri: URI,
    { content, tags }: { content: string; tags: string[][] }
  ) {
    const event: EventTemplate = {
      kind: 1111,
      created_at: Math.floor(Date.now() / 1000),
      content,
      tags: [["i", uri.toLowerCase()], ["k", getKindFromURI(uri)], ...tags],
    };
    await this.publish(event);
  }

  async publish(event: EventTemplate) {
    if (!this.nsec) {
      throw new Error("Nostr: No nsec provided");
    }

    // if env is test, just log the event
    if (process.env.ENV === "test") {
      console.log(">>> Nostr publish:", event);
      return;
    }

    const { data: secretKey } = nip19.decode(this.nsec);
    const signedEvent = finalizeEvent(event, secretKey as Uint8Array);
    console.log(">>> NostrProvider publishing event", signedEvent);
    await Promise.any(this.pool.publish(this.relays!, signedEvent));
    console.log(">>> NostrProvider event published", signedEvent);
  }

  async close() {
    if (this.pool) {
      await this.pool.close(this.relays!);
    }
  }
}
