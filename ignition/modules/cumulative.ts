import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export const CumulativeDrop = buildModule('CumulativeDrop', (m) => {
    const drop = m.contract('CumulativeMerkleDrop', [
        m.getParameter<string>('token'),
    ]);
    return { drop };
});

export const CumulativeDrop128 = buildModule('CumulativeDrop128', (m) => {
    const drop = m.contract('CumulativeMerkleDrop128', [
        m.getParameter<string>('token'),
    ]);
    return { drop };
});

