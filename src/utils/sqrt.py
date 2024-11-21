import math

def calculate_init_amounts_int256(L, range_percent):
    """
    Calculate initial token amounts for USDC/USDT pool with 1.0 price
    L: Total liquidity
    range_percent: Price range percentage
    """
    Q96 = 2**96
    sqrtP = Q96  # This represents sqrt(1.0) in Q64.96 format
    
    # Calculate price bounds
    Pa = 1.0 * (1 - range_percent)
    Pb = 1.0 * (1 + range_percent)
    
    sqrt_Pa = int(math.sqrt(Pa) * Q96)
    sqrt_Pb = int(math.sqrt(Pb) * Q96)
    
    # Calculate initial amounts
    amount0 = L * (sqrt_Pb - sqrtP) // sqrtP
    amount1 = L * (sqrtP - sqrt_Pa) // Q96
    
    return amount0, amount1

# Given values
L = 2607641355896739
range_percent = 0.001  # 0.1% range

init0, init1 = calculate_init_amounts_int256(L, range_percent)

print(f"init0: {init0}")
print(f"init1: {init1}")