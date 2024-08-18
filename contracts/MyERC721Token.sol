// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Import specific contracts rather than globally importing entire files.
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MyERC721Token is ERC721, ERC721URIStorage, Ownable {
    constructor(string memory name, string memory symbol, address initialOwner)
        ERC721(name, symbol)
        Ownable(initialOwner)
    {
        _mint(msg.sender, 0);
        // hash QmUt8uq3GwXjrGDm2We5FEX2rzU3fSEaMTkrHoSKdkRBXR
        _setTokenURI(0, "https://gateway.pinata.cloud/ipfs/QmdFAGkcP8zpQW2Crka2KJwdtkuBc4e9eq4E4X2sBwFY2X");

        _mint(msg.sender, 1);
        // hash QmX3rshx3RJRKYUoE5n42jvkoSYehNppukaq3c1trWeEoF
        _setTokenURI(1, "https://gateway.pinata.cloud/ipfs/QmSBAapfuRb7wPtZ6a8Qrwhm3AMsBQcn6oVJaDH9ZXubrF");
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        require(ownerOf(tokenId) != address(0), "Nonexistent token");
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
