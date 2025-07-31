import { expect } from 'chai';
import { describe, it } from 'mocha';
import { 
  config,
  formatBaseUrl, 
  getChainConfig,
  getTokenAddress
} from '../../../src/config';

describe('Config Module', () => {
  describe('chains configuration', () => {
    it('should have mainnet configuration', () => {
      expect(config.chains.mainnet).to.exist;
      expect(config.chains.mainnet.id).to.equal(1);
      expect(config.chains.mainnet.tokenAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should have BSC configuration', () => {
      expect(config.chains.bsc).to.exist;
      expect(config.chains.bsc.id).to.equal(56);
      expect(config.chains.bsc.tokenAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should have Base configuration', () => {
      expect(config.chains.base).to.exist;
      expect(config.chains.base.id).to.equal(8453);
      expect(config.chains.base.tokenAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should have Hardhat configuration', () => {
      expect(config.chains.hardhat).to.exist;
      expect(config.chains.hardhat.id).to.equal(31337);
      expect(config.chains.hardhat.tokenAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('paths configuration', () => {
    it('should have correct path structure', () => {
      expect(config.paths.qrCodes).to.equal('./src/qr');
      expect(config.paths.testQrCodes).to.equal('./src/test_qr');
      expect(config.paths.generatedData).to.equal('./src/gendata');
      expect(config.paths.latestVersion).to.equal('./src/.latest');
    });
  });

  describe('urls configuration', () => {
    it('should have correct URL templates', () => {
      expect(config.urls.baseUrl).to.equal('https://app.1inch.io/#/{chainId}/qr?');
      expect(config.urls.encodedPrefix).to.equal('https://wallet.1inch.io/app/w3browser?link=');
    });
  });

  describe('defaults configuration', () => {
    it('should have correct default values', () => {
      expect(config.defaults.testCodeCount).to.equal(10);
      expect(config.defaults.testCodeAmount).to.equal('1');
    });
  });

  describe('formatBaseUrl', () => {
    it('should format URL for mainnet', () => {
      const url = formatBaseUrl(1);
      expect(url).to.equal('https://app.1inch.io/#/1/qr?');
    });

    it('should format URL for BSC', () => {
      const url = formatBaseUrl(56);
      expect(url).to.equal('https://app.1inch.io/#/56/qr?');
    });

    it('should format URL for Base', () => {
      const url = formatBaseUrl(8453);
      expect(url).to.equal('https://app.1inch.io/#/8453/qr?');
    });

    it('should format URL for unknown chain', () => {
      const url = formatBaseUrl(999);
      expect(url).to.equal('https://app.1inch.io/#/999/qr?');
    });
  });

  describe('getChainConfig', () => {
    it('should return config for mainnet', () => {
      const result = getChainConfig(1);
      expect(result).to.exist;
      expect(result?.name).to.equal('mainnet');
      expect(result?.config).to.deep.equal(config.chains.mainnet);
    });

    it('should return config for BSC', () => {
      const result = getChainConfig(56);
      expect(result).to.exist;
      expect(result?.name).to.equal('bsc');
      expect(result?.config).to.deep.equal(config.chains.bsc);
    });

    it('should return config for Base', () => {
      const result = getChainConfig(8453);
      expect(result).to.exist;
      expect(result?.name).to.equal('base');
      expect(result?.config).to.deep.equal(config.chains.base);
    });

    it('should return undefined for unknown chain', () => {
      const result = getChainConfig(999);
      expect(result).to.be.undefined;
    });

    it('should return config for Hardhat', () => {
      const result = getChainConfig(31337);
      expect(result).to.exist;
      expect(result?.name).to.equal('hardhat');
      expect(result?.config).to.deep.equal(config.chains.hardhat);
    });
  });

  describe('getTokenAddress', () => {
    it('should return token address for mainnet', () => {
      const address = getTokenAddress(1);
      expect(address).to.equal(config.chains.mainnet.tokenAddress);
    });

    it('should return token address for BSC', () => {
      const address = getTokenAddress(56);
      expect(address).to.equal(config.chains.bsc.tokenAddress);
    });

    it('should return token address for Base', () => {
      const address = getTokenAddress(8453);
      expect(address).to.equal(config.chains.base.tokenAddress);
    });

    it('should return undefined for unknown chain', () => {
      const address = getTokenAddress(999);
      expect(address).to.be.undefined;
    });
  });
});
