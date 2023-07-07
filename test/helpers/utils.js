const ethWallet = require('ethereumjs-wallet').default;

function generateSalt () {
    return ethWallet.generate().getPrivateKeyString().substr(0, 34);
}

module.exports = {
    generateSalt,
};
