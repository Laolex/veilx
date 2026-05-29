import type { Config } from "wagmi";
import {
  getAccount,
  getBlock,
  getChainId,
  readContract,
  signTypedData,
  waitForTransactionReceipt,
  watchAccount,
  writeContract,
} from "@wagmi/core";
import { TransactionRevertedError } from "@zama-fhe/react-sdk";

export class WagmiCompatSigner {
  private config: Config;

  constructor({ config }: { config: Config }) {
    this.config = config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.config);
  }

  async getAddress(): Promise<`0x${string}`> {
    const account = getAccount(this.config);
    if (!account?.address) throw new TypeError("No connected account");
    return account.address;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async signTypedData(typedData: any): Promise<`0x${string}`> {
    // Strip EIP712Domain — wagmi's signTypedData doesn't want it in the types object
    const { EIP712Domain: _, ...types } = typedData.types as Record<string, unknown>;
    return signTypedData(this.config, {
      primaryType: Object.keys(types)[0],
      types: types as Parameters<typeof signTypedData>[1]["types"],
      domain: typedData.domain,
      message: typedData.message,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async writeContract(args: any): Promise<`0x${string}`> {
    return writeContract(this.config, args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async readContract(args: any): Promise<unknown> {
    return readContract(this.config, args);
  }

  async waitForTransactionReceipt(hash: `0x${string}`) {
    try {
      return await waitForTransactionReceipt(this.config, { hash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("could not be found") || msg.includes("Transaction not found")) {
        throw new TransactionRevertedError(
          `Could not find receipt for tx "${hash.slice(0, 10)}…"`,
          { cause: err instanceof Error ? err : undefined }
        );
      }
      throw err;
    }
  }

  async getBlockTimestamp(): Promise<bigint> {
    return (await getBlock(this.config)).timestamp;
  }

  subscribe(callbacks: {
    onDisconnect?: () => void;
    onAccountChange?: (address: `0x${string}`) => void;
    onChainChange?: (chainId: number) => void;
  }): () => void {
    const { onDisconnect = () => {}, onAccountChange = () => {}, onChainChange = () => {} } = callbacks;
    return watchAccount(this.config, {
      onChange(account, prevAccount) {
        if (account.status === "disconnected" && prevAccount.status !== "disconnected") {
          onDisconnect();
        }
        if (prevAccount.address && account.address && account.address !== prevAccount.address) {
          onAccountChange(account.address);
        }
        if (
          typeof prevAccount.chainId === "number" &&
          typeof account.chainId === "number" &&
          account.chainId !== prevAccount.chainId
        ) {
          onChainChange(account.chainId);
        }
      },
    });
  }
}
