import hre from 'hardhat';
import { verifyContract } from '@nomicfoundation/hardhat-verify/verify';
import SignatureDropModule from './modules/signature';

interface OneInchAddress {
    networkId: number;
    addr: string;
}

export async function deploy (version: number, merkleRoot: string, merkleHeight: number) {
    const connection = await hre.network.connect();
    const chainId = connection.networkConfig.chainId;
    const networkName = connection.networkName;

    const oneInchAddresses: OneInchAddress[] = (await import('./reward-tokens.json')).oneInch as OneInchAddress[];

    const rewardToken = oneInchAddresses.find((token) => token.networkId == chainId); // eslint-disable-line eqeqeq
    if (rewardToken === undefined || rewardToken.addr === undefined) {
        console.log('No reward token mapped for the chain', chainId);
        return;
    }
    console.log('reward token address', rewardToken.addr);

    console.log(`running deploy script: deploy script ${version} with parameters: ${merkleRoot} ${merkleHeight}`);
    console.log('network id ', chainId);

    const constructorArgs: [string, string, number] = [rewardToken.addr, merkleRoot, merkleHeight];

    const { drop } = await connection.ignition.deploy(SignatureDropModule, {
        parameters: {
            'SignatureDrop': {
                'token': rewardToken.addr,
                'merkleRoot': merkleRoot,
                'merkleHeight': merkleHeight,
            },
        },
        deploymentId: `${networkName}-MerkleDrop-${version}`,
    });

    console.log(`Deployed at address: ${drop.target}\n`);

    if (chainId !== 31337) {
        await verifyContract({
            address: drop.target.toString(),
            constructorArgs: constructorArgs,
        }, hre);
    }

    return drop;
}
