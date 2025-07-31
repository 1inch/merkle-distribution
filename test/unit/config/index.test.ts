import { expect } from 'chai';
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
    it('should have all required paths defined', () => {
      expect(config.paths).to.exist;
      expect(config.paths.qrCodes).to.be.a('string');
      expect(config.paths.testQrCodes).to.be.a('string');
      expect(config.paths.generatedData).to.be.a('string');
      expect(config.paths.latestVersion).to.be.a('string');
    });

    it('should have paths that start with ./', () => {
      expect(config.paths.qrCodes).to.match(/^\.\//);
      expect(config.paths.testQrCodes).to.match(/^\.\//);
      expect(config.paths.generatedData).to.match(/^\.\//);
      expect(config.paths.latestVersion).to.match(/^\.\//);
    });
  });

  describe('urls configuration', () => {
    it('should have all required URLs defined', () => {
      expect(config.urls).to.exist;
      expect(config.urls.baseUrl).to.be.a('string');
      expect(config.urls.encodedPrefix).to.be.a('string');
    });

    it('should have baseUrl with chainId placeholder', () => {
      expect(config.urls.baseUrl).to.include('{chainId}');
    });

    it('should have valid URL formats', () => {
      expect(config.urls.baseUrl).to.match(/^https?:\/\//);
      expect(config.urls.encodedPrefix).to.match(/^https?:\/\//);
    });
  });

  describe('defaults configuration', () => {
    it('should have correct default values', () => {
      expect(config.defaults.testCodeCount).to.equal(10);
      expect(config.defaults.testCodeAmount).to.equal('1');
    });
  });

  describe('formatBaseUrl', () => {
    it('should replace chainId placeholder with actual chain ID', () => {
      const chainId = 1;
      const url = formatBaseUrl(chainId);
      expect(url).to.equal(config.urls.baseUrl.replace('{chainId}', chainId.toString()));
    });

    it('should format URL for mainnet', () => {
      const url = formatBaseUrl(1);
      expect(url).to.equal(config.urls.baseUrl.replace('{chainId}', '1'));
    });

    it('should format URL for BSC', () => {
      const url = formatBaseUrl(56);
      expect(url).to.equal(config.urls.baseUrl.replace('{chainId}', '56'));
    });

    it('should format URL for Base', () => {
      const url = formatBaseUrl(8453);
      expect(url).to.equal(config.urls.baseUrl.replace('{chainId}', '8453'));
    });

    it('should format URL for unknown chain', () => {
      const url = formatBaseUrl(999);
      expect(url).to.equal(config.urls.baseUrl.replace('{chainId}', '999'));
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
