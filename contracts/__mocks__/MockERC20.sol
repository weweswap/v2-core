// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("CHAOS", "CHAOS") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}
