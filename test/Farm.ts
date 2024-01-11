import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Farm, ERC20 } from "../typechain-types";
import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { parseEther } from "ethers";

describe("Farm contract", () => {
	let farmContract: Farm;
	let lpToken: ERC20;

	let contractOwner: HardhatEthersSigner;

	let holder1: HardhatEthersSigner;
	let holder2: HardhatEthersSigner;
	let holder3: HardhatEthersSigner;

	before(async () => {
		[contractOwner, holder1, holder2, holder3] = await ethers.getSigners();

		const LP = await ethers.getContractFactory("Token");
		lpToken = await LP.deploy("Liquidity Token", "LP", 18);

		const FARM = await ethers.getContractFactory("Farm");
		farmContract = await FARM.deploy(lpToken);
	});

	it("should contract be empty", async () => {
		expect(await lpToken.balanceOf(await farmContract.getAddress())).to.eq(0n);
		expect(await farmContract.totalSupply()).to.eq(0n);
	});

	describe("Holder1 stack and claim", () => {
		let stackTime: number;
		before(async () => {
			await lpToken.transfer(holder1, parseEther("1"));
		});

		it("should holder1 stack 1 success", async () => {
			await lpToken
				.connect(holder1)
				.approve(await farmContract.getAddress(), parseEther("1"));

			stackTime = (await time.latest()) + 10;
			await time.setNextBlockTimestamp(stackTime);

			await expect(await farmContract.connect(holder1).deposit(parseEther("1")))
				.not.reverted;
		});

		it("should contract have 1 lp and holde1 have 0", async () => {
			expect(await lpToken.balanceOf(farmContract)).to.eq(parseEther("1"));
			expect(await lpToken.balanceOf(holder1)).to.eq(parseEther("0"));
		});

		it("should claim 1 at stack time + 1", async () => {
			await time.setNextBlockTimestamp(stackTime + 1);

			await expect(
				await farmContract.connect(holder1).claimPendingReward()
			).to.changeTokenBalance(farmContract, holder1, parseEther("1"));

			expect(await farmContract.balanceOf(holder1)).to.eq(parseEther("1"));
		});

		it("should withdraw 1 success at stack time +2, and receive 1 pending reward", async () => {
			await time.setNextBlockTimestamp(stackTime + 2);

			await expect(
				await farmContract.connect(holder1).withdraw(parseEther("1"))
			).not.reverted;

			await expect(
				await farmContract.connect(holder1).claimPendingReward()
			).to.changeTokenBalance(farmContract, holder1, parseEther("1"));

			expect(await farmContract.balanceOf(holder1)).to.eq(parseEther("2"));
		});

		it("should contract have 0 lp left", async () => {
			await expect(await lpToken.balanceOf(farmContract)).to.eq(
				parseEther("0")
			);
			await expect(await lpToken.balanceOf(holder1)).to.eq(parseEther("1"));
		});
	});

	describe("Holder 1 stack, holder2 stack, claim later", () => {
		/**
		 * Assume that reward per sec is 1e18
		 * - Holder1 stack 1 at `timestamp`
		 * - Holder2 stack 1 at `timestamp + 1`
		 * - Holder2 claim at `timestamp + 2`: pending reward should be 0.5
		 * - Holder1 claim at `timestamp + 3`: pending reward should be 2.0
		 * - Holder2 withdraw all at `timestamp +5`: pending reward should be 1.5
		 * - Holder2 claim at timestamp +6: should be 1.5
		 * - Holder2 claim at timestamp +7: should be 0
		 * - Holder1 claim at timestamp +8: should be 4
		 */

		let baseTimestamp: number;
		before(async () => {
			await lpToken.transfer(holder2, parseEther("1"));
			const h1Balance = await lpToken.balanceOf(holder1);
			if (h1Balance < parseEther("1")) {
				await lpToken.transfer(holder1, parseEther("1"));
			}

			await lpToken
				.connect(holder1)
				.approve(await farmContract.getAddress(), parseEther("1"));

			await lpToken
				.connect(holder2)
				.approve(await farmContract.getAddress(), parseEther("1"));
		});

		it("should holder1,holder2 stack success", async () => {
			baseTimestamp = (await time.latest()) + 10;
			await time.setNextBlockTimestamp(baseTimestamp);

			await expect(farmContract.connect(holder1).deposit(parseEther("1"))).not
				.reverted;

			await time.setNextBlockTimestamp(baseTimestamp + 1);

			await expect(farmContract.connect(holder2).deposit(parseEther("1"))).not
				.reverted;

			await expect(await lpToken.balanceOf(farmContract)).to.eq(
				parseEther("2")
			);
			await expect(await lpToken.balanceOf(holder1)).to.eq(parseEther("0"));
			await expect(await lpToken.balanceOf(holder2)).to.eq(parseEther("0"));
		});

		it("should holder2 claim 0.5 at timestamp+2", async () => {
			await time.setNextBlockTimestamp(baseTimestamp + 2);

			await expect(
				farmContract.connect(holder2).claimPendingReward
			).to.changeTokenBalance(farmContract, holder2, parseEther("0.5"));

			await expect(await farmContract.balanceOf(holder2)).to.eq(
				parseEther("0.5")
			);
		});

		it("should holder1 claim 2 at timestamp +3", async () => {
			const oldRewardBalance = await farmContract.balanceOf(holder1);
			await time.setNextBlockTimestamp(baseTimestamp + 3);

			await expect(
				farmContract.connect(holder1).claimPendingReward
			).to.changeTokenBalance(farmContract, holder1, parseEther("2"));

			await expect(await farmContract.balanceOf(holder1)).to.eq(
				oldRewardBalance + parseEther("2.0")
			);
		});

		// describe("should holder2 have 1.5 pending reward after withdraw all at timestamp +5", () => {
		it("should holder2 withdraw success at timestamp+5", async () => {
			await time.setNextBlockTimestamp(baseTimestamp + 5);

			await expect(farmContract.connect(holder2).withdraw(parseEther("1"))).not
				.reverted;
			await expect(await lpToken.balanceOf(holder2)).to.eq(parseEther("1"));
			await expect(await lpToken.balanceOf(farmContract)).to.eq(
				parseEther("1")
			);
		});

		it("should holder2 claim 1.5 at timestamp+6", async () => {
			await time.setNextBlockTimestamp(baseTimestamp + 6);

			await expect(
				farmContract.connect(holder2).claimPendingReward()
			).to.changeTokenBalance(farmContract, holder2, parseEther("1.5"));
		});

		it("should holder2 claim 0 at timestamp +7", async () => {
			await time.setNextBlockTimestamp(baseTimestamp + 7);

			await expect(
				farmContract.connect(holder2).claimPendingReward()
			).to.changeTokenBalance(farmContract, holder2, parseEther("0"));
		});
		// });

		it("should holder1 claim 4 at timestamp +8", async () => {
			await time.setNextBlockTimestamp(baseTimestamp + 8);

			await expect(
				farmContract.connect(holder1).claimPendingReward()
			).to.changeTokenBalance(farmContract, holder1, parseEther("4"));
		});
	});
});
