// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/TheSpireth.sol";

contract DeployScript is Script {
    function run() external {
        address owner = vm.envOr("OWNER_ADDRESS", address(0));
        address dev = vm.envOr("DEV_ADDRESS", address(0));
        uint256 rollCost = vm.envOr("ROLL_COST", uint256(0.002 ether));
        uint256 mintCap = vm.envOr("MINT_CAP", uint256(1000));
        
        if (owner == address(0)) {
            owner = vm.addr(vm.envUint("PRIVATE_KEY"));
        }
        if (dev == address(0)) {
            dev = owner;
        }
        
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        TheSpireth spireth = new TheSpireth(owner, dev, rollCost, mintCap);
        
        vm.stopBroadcast();
        
        console.log("TheSpireth deployed at:", address(spireth));
        console.log("  Owner:", owner);
        console.log("  Dev:", dev);
        console.log("  Roll Cost:", rollCost);
        console.log("  Mint Cap:", mintCap);
    }
}

contract DeployLocalScript is Script {
    function run() external {
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address deployer = vm.addr(deployerPrivateKey);
        
        address owner = deployer;
        address dev = vm.addr(0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d);
        
        uint256 rollCost = 0.002 ether;
        uint256 mintCap = 100;
        
        vm.startBroadcast(deployerPrivateKey);
        
        TheSpireth spireth = new TheSpireth(owner, dev, rollCost, mintCap);
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=================================");
        console.log("The Spireth - Local Deployment");
        console.log("=================================");
        console.log("");
        console.log("Contract:", address(spireth));
        console.log("Owner:", owner);
        console.log("Dev:", dev);
        console.log("Roll Cost:", rollCost, "wei (~$5 at $2500/ETH)");
        console.log("Mint Cap:", mintCap);
        console.log("");
        console.log("Anvil Accounts:");
        console.log("  [0] Deployer/Owner:", deployer);
        console.log("  [1] Dev:", dev);
        console.log("");
    }
}
