import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Farm, ERC20, Whitelist } from "../typechain-types";
import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { parseEther } from "ethers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

describe("Farm contract", () => {
	let whitelistContract: Whitelist;

	let contractOwner: HardhatEthersSigner;

	let holder1: HardhatEthersSigner;
	let holder2: HardhatEthersSigner;
	let holder3: HardhatEthersSigner;

	let values = [];
	let tree;

	let proof1: string[] = [];
	let proof2: string[] = [];
	let proof3: string[] = [];

	before(async () => {
		[contractOwner, holder1, holder2, holder3] = await ethers.getSigners();
		const WHITE = await ethers.getContractFactory("Whitelist");

		values = [
			[holder1.address, parseEther("1")],
			[holder2.address, parseEther("2")],
			[holder3.address, parseEther("3")],
		];

		tree = StandardMerkleTree.of(values, ["address", "uint256"]);

		for (const [i, v] of tree.entries()) {
			const proof = tree.getProof(i);
			if (v[0] === holder1.address) {
				proof1 = proof;
			} else if (v[0] === holder2.address) {
				proof2 = proof;
			} else if (v[0] === holder3.address) {
				proof3 = proof;
			}
		}

		whitelistContract = await WHITE.deploy(tree.root);

		// const transactionHash = await contractOwner.sendTransaction({
		// 	to: await whitelistContract.getAddress(),
		// 	value: parseEther("10"), // Sends exactly 1.0 ether
		// });
	});

	it("should verify holder 1 with value 1", async () => {
		await expect(
			whitelistContract.verify(proof1, holder1, parseEther("2"))
		).to.revertedWith("Invalid proof");
		await expect(whitelistContract.verify(proof1, holder1, parseEther("1"))).not
			.reverted;
	});

	it("should holder2 verify with value 2", async () => {
		await expect(whitelistContract.verify(proof2, holder2, parseEther("2"))).not
			.reverted;
	});

	it("should holder1 be removed after update", async () => {
		values = [
			[holder2.address, parseEther("3")],
			[holder3.address, parseEther("2")],
		];

		tree = StandardMerkleTree.of(values, ["address", "uint256"]);

		for (const [i, v] of tree.entries()) {
			const proof = tree.getProof(i);
			if (v[0] === holder1.address) {
				proof1 = proof;
			} else if (v[0] === holder2.address) {
				proof2 = proof;
			} else if (v[0] === holder3.address) {
				proof3 = proof;
			}
		}

		await whitelistContract.connect(contractOwner).updateRoot(tree.root);

		await expect(
			whitelistContract.verify(proof1, holder1, parseEther("1"))
		).to.revertedWith("Invalid proof");
	});

	it("should holder2 and holder3 update value", async () => {
		await expect(whitelistContract.verify(proof2, holder2, parseEther("2"))).to
			.reverted;

		await expect(whitelistContract.verify(proof3, holder3, parseEther("3"))).to
			.reverted;

		//
		await expect(whitelistContract.verify(proof2, holder2, parseEther("3"))).not
			.reverted;

		await expect(whitelistContract.verify(proof3, holder3, parseEther("2"))).not
			.reverted;
	});
});
