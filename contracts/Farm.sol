// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract Farm is ERC20 {
    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 pendingReward; // Pending reward waiting for claiming.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of ERC20s
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accRewardPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accRewardPerShare` (and `lastRewardTimestamp`) gets updated.
        //   2. Update pending reward of user.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // LP TOKEN.
    IERC20 lpToken;

    uint256 accRewardPerShare;

    uint256 lastRewardTimestamp;

    // Reward tokens created per block.
    uint256 rewardPerSec; // x * _REWARD_MULTIPLIER

    // The timestamp used as base to calculate reward.
    uint256 startTimestamp;

    // Info of each user that stakes LP tokens.
    mapping(address => UserInfo) public userInfo;

    uint256 private _REWARD_MULTIPLIER = 1e36;

    constructor(IERC20 _lpToken) ERC20("Reward Token", "REWARD") {
        lpToken = _lpToken;

        startTimestamp = block.timestamp;
        lastRewardTimestamp = startTimestamp;

        rewardPerSec = 1e18 * _REWARD_MULTIPLIER;
    }

    // Baseline current reward per share
    function baselineRewardPerShare() public {
        uint256 lastTimestamp = block.timestamp;
        if (lastTimestamp <= lastRewardTimestamp) {
            return;
        }

        // Calculate LP supply
        uint256 lpSupply = lpToken.balanceOf(address(this));
        // If there is none LP left, dont accumulate reward
        if (lpSupply == 0) {
            lastRewardTimestamp = lastTimestamp;
            return;
        }
        // End of calculate LP supply

        uint256 diffOfTimestamp = lastTimestamp - lastRewardTimestamp;
        uint256 rewardPerShare = (diffOfTimestamp * rewardPerSec) / lpSupply;

        accRewardPerShare += rewardPerShare;
        lastRewardTimestamp = block.timestamp;
    }

    // Allow user to claim their pending reward
    function claimPendingReward() public {
        baselineRewardPerShare(); // baseline reward per share before send reward

        UserInfo storage user = userInfo[msg.sender];
        // Assumse that LP token and Reward token both use same decimals
        // Which should be true since both is IERC20
        uint256 pendingAmount = (user.amount * accRewardPerShare) /
            _REWARD_MULTIPLIER -
            user.rewardDebt;

        accumulatePendingReward(address(msg.sender), pendingAmount); // Accumulate pending reward

        uint256 pendingReward = user.pendingReward;
        user.pendingReward = 0;
        transferReward(address(msg.sender), pendingReward);

        user.rewardDebt =
            (user.amount * accRewardPerShare) /
            _REWARD_MULTIPLIER;
    }

    // Deposit LP tokens
    function deposit(uint256 _amount) public {
        UserInfo storage user = userInfo[msg.sender];

        baselineRewardPerShare(); // baseline reward per share before deposit

        // Baseline old reward
        if (user.amount > 0) {
            // Assumse that LP token and Reward token both use same decimals
            // Which should be true since both is IERC20
            uint256 pendingAmount = (user.amount * accRewardPerShare) /
                _REWARD_MULTIPLIER -
                user.rewardDebt;

            // transferReward(address(msg.sender), pendingAmount); // Transfer pending reward
            accumulatePendingReward(address(msg.sender), pendingAmount); // Accumulate pending reward
        }

        lpToken.transferFrom(address(msg.sender), address(this), _amount);
        user.amount += _amount;
        user.rewardDebt =
            (user.amount * accRewardPerShare) /
            _REWARD_MULTIPLIER;
    }

    // Withdraw deposited LP tokens
    function withdraw(uint256 _amount) public {
        UserInfo storage user = userInfo[msg.sender];
        require(
            user.amount >= _amount,
            "withdraw: can't withdraw more than deposit"
        );

        baselineRewardPerShare(); // baseline reward per share before withdraw

        // Assumse that LP token and Reward token both use same decimals
        // Which should be true since both is IERC20
        uint256 pendingAmount = (user.amount * accRewardPerShare) /
            _REWARD_MULTIPLIER -
            user.rewardDebt;

        // transferReward(address(msg.sender), pendingAmount); // Transfer reward
        accumulatePendingReward(address(msg.sender), pendingAmount); // Accumulate pending reward

        user.amount -= _amount;
        user.rewardDebt =
            (user.amount * accRewardPerShare) /
            _REWARD_MULTIPLIER;
        lpToken.transfer(address(msg.sender), _amount);
    }

    // Accumulate user's pending reward
    function accumulatePendingReward(address _to, uint256 _amount) internal {
        UserInfo storage user = userInfo[_to];
        user.pendingReward += _amount;
    }

    // Transfer reward token
    function transferReward(address _to, uint256 _amount) internal {
        _mint(_to, _amount);
    }
}
