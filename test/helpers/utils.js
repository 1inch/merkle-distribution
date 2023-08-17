const ethWallet = require('ethereumjs-wallet').default;

function generateSalt () {
    return ethWallet.generate().getPrivateKeyString().slice(0, 34);
}

module.exports = {
    generateSalt,
};
