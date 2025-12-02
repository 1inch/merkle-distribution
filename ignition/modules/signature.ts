import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SignatureDrop", (m) => {
  const drop = m.contract("SignatureMerkleDrop128", [
    m.getParameter<string>('token'),
    m.getParameter<string>('merkleRoot'),
    m.getParameter<number>('merkleHeight'),
  ]);
  return { drop };
});