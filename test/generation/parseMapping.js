const { expect } = require('chai');
const { parseMapping } = require('../../src/nft_drop/gen_nft_lib');

describe('parseMapping Function', () => {
    it('should return the mapping directly if already in account -> [tokenIds] format', () => {
        const input = '{"0x123": ["1", "2"], "0x456": ["3", "4"]}';
        const expectedOutput = {
            '0x123': ['1', '2'],
            '0x456': ['3', '4'],
        };
        const result = parseMapping(input);
        expect(result).to.deep.equal(expectedOutput);
    });

    it('should convert tokenId -> account format to account -> [tokenIds]', () => {
        const input = '{"1": "0x123", "2": "0x123", "3": "0x456"}';
        const expectedOutput = {
            '0x123': ['1', '2'],
            '0x456': ['3'],
        };
        const result = parseMapping(input);
        expect(result).to.deep.equal(expectedOutput);
    });

    it('should handle comma-separated account=tokenId format', () => {
        const input = '1=0x123,2=0x123,3=0x456,4=0x456';
        const expectedOutput = {
            '0x123': ['1', '2'],
            '0x456': ['3', '4'],
        };
        const result = parseMapping(input);
        expect(result).to.deep.equal(expectedOutput);
    });

    it('should handle comma-separated tokenId=account format', () => {
        const input = '1=0x123,2=0x123,3=0x456,4=0x456';
        const expectedOutput = {
            '0x123': ['1', '2'],
            '0x456': ['3', '4'],
        };
        const result = parseMapping(input);
        expect(result).to.deep.equal(expectedOutput);
    });

    it('should handle mixed format with lists', () => {
        const input = '1=0x123,2=0x123,3=0x456,4=0x456';
        const expectedOutput = {
            '0x123': ['1', '2'],
            '0x456': ['3', '4'],
        };
        const result = parseMapping(input);
        expect(result).to.deep.equal(expectedOutput);
    });

    it('should handle empty input', () => {
        const input = '';
        const expectedOutput = null;
        const result = parseMapping(input);
        expect(result).to.deep.equal(expectedOutput);
    });
});
