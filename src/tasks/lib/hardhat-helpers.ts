import fs from 'fs';
import path from 'node:path';

type DeployedAddresses = Record<string, string>;
type IgnitionJournal = unknown[];

interface SignatureDropJournalValues {
    address: string;
    rewardToken: string;
    merkleRoot: string;
    merkleHeight: number;
    constructorArgs: unknown[];
    txHash: string;
    blockHash: string;
    blockNumber: number;
}

interface JournalArtifactsEntry {
    futureId: string;
    artifactId: string;
    constructorArgs: unknown[];
}

interface JournalDeploymentEntry {
    futureId: string;
    type: string;
    result: {
        address: string;
    }
}

interface JournalTransactionEntry {
    futureId: string;
    type: string;
    hash: string;
    receipt: {
        blockHash: string;
        blockNumber: number;
        contractAddress: string;
    }
}

export class SignatureDropIgnition {
    public static get moduleId (): string { return 'SignatureDrop'; }
    public static get futureId (): string { return 'SignatureMerkleDrop128'; }

    public static get futureKey (): string {
        return IgnitionHelper.getQualifiedFutureKey(this.moduleId, this.futureId);
    }

    public static deploymentId (networkName: string, version: number): string {
        return `${networkName}-MerkleDrop-${version}`;
    }

    public static async getAddress (networkName: string, version: number): Promise<string | undefined> {
        return IgnitionHelper.getDeployedAddress(this.deploymentId(networkName, version), this.futureKey);
    }

    public static async getConstructorArgs (networkName: string, version: number): Promise<unknown[] | undefined> {
        const journal = await IgnitionHelper.getJournal(this.deploymentId(networkName, version));
        return IgnitionHelper.parseConstructorArgs(journal, this.futureKey);
    }

    public static async getLogValues (networkName: string, version: number): Promise<Partial<SignatureDropJournalValues>> {
        const journal = await IgnitionHelper.getJournal(this.deploymentId(networkName, version));

        const constructorArgs = IgnitionHelper.parseConstructorArgs(journal, this.futureKey);
        const txReceipt = IgnitionHelper.parseTxReciept(journal, this.futureKey);

        return {
            // deployed address
            address: txReceipt?.address,
            // contructorArgs
            rewardToken: constructorArgs?.[0] as string,
            merkleRoot: constructorArgs?.[1] as string,
            merkleHeight: constructorArgs?.[2] as number,
            // chain params
            txHash: txReceipt?.txHash,
            blockHash: txReceipt?.blockHash,
            blockNumber: txReceipt?.blockNumber,
        };
    }
};

export class IgnitionHelper {
    public static getQualifiedFutureKey (
        moduleId: string,
        futureId: string,
    ) : string {
        return `${moduleId}#${futureId}`;
    }

    static async getDeployments (
        deploymentId: string,
    ): Promise<DeployedAddresses> {
        const filePath = path.join(
            process.cwd(),
            'ignition',
            'deployments',
            deploymentId,
            'deployed_addresses.json',
        );

        if (!fs.existsSync(filePath)) {
            return {};
        }

        const raw = fs.readFileSync(filePath, 'utf8');

        return JSON.parse(raw) as DeployedAddresses;
    }

    static async getDeployedAddress (
        deploymentId: string,
        futureKey: string,
    ): Promise<string | undefined> {
        const deployedAddresses = await IgnitionHelper.getDeployments(deploymentId);
        return deployedAddresses[futureKey];
    }

    static async getJournal (deploymentId: string): Promise<IgnitionJournal> {
        const filePath = path.join(
            process.cwd(),
            'ignition',
            'deployments',
            deploymentId,
            'journal.jsonl',
        );

        if (!fs.existsSync(filePath)) {
            return [];
        }

        const raw = fs.readFileSync(filePath, 'utf8');
        const entries = raw.trim().split('\n').map(line => JSON.parse(line));
        return entries as IgnitionJournal;
    }

    static parseConstructorArgs (journal: IgnitionJournal, futureKey: string): unknown[] | undefined {
        if (!journal || journal.length === 0) {
            return undefined;
        }

        const entry = journal.find((e) => (e as JournalArtifactsEntry).futureId === futureKey && (e as JournalArtifactsEntry).artifactId === futureKey);
        if (!entry) {
            return undefined;
        }

        return (entry as JournalArtifactsEntry).constructorArgs;
    }

    static parseAddress (journal: IgnitionJournal, futureKey: string): string | undefined {
        if (!journal || journal.length === 0) {
            return undefined;
        }

        const entry = journal.find((e) =>
            (e as JournalDeploymentEntry).futureId === futureKey &&
            (e as JournalDeploymentEntry).type === 'DEPLOYMENT_EXECUTION_STATE_COMPLETE' &&
            (e as JournalDeploymentEntry).result,
        );

        if (!entry) {
            return undefined;
        }

        return (entry as JournalDeploymentEntry).result?.address;
    }

    static parseTxReciept (journal: IgnitionJournal, futureKey: string):
        Partial<{
            txHash: string
            blockHash: string;
            blockNumber: number;
            address: string;
        }> | undefined
    {
        if (!journal || journal.length === 0) {
            return undefined;
        }

        const entry = journal.find((e) =>
            (e as JournalTransactionEntry).futureId === futureKey &&
            (e as JournalTransactionEntry).type === 'TRANSACTION_CONFIRM' &&
            (e as JournalTransactionEntry).receipt,
        );

        if (!entry) {
            return undefined;
        }

        return {
            txHash: (entry as JournalTransactionEntry).hash,
            blockHash: (entry as JournalTransactionEntry).receipt?.blockHash,
            blockNumber: (entry as JournalTransactionEntry).receipt?.blockNumber,
            address: (entry as JournalTransactionEntry).receipt?.contractAddress,
        };
    }
}
