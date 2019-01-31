# Sabre

Minimum viable [MythX](https://mythx.io) client. Compiles a single Solidity smart contract and sends it to MythX API for security analysis.

## Usage

1. Use Metamask to sign up for an account on the [MythX website](https://mythx.io) and set your API password.

2. Get the code:

```
$ git clone https://github.com/b-mueller/sabre/
```

3. Set up your environment. Use the Ethereum address you signed up with as the username (for increased convenience add those three lines into your `.bashrc`).

```
export MYTHX_API_URL=https://api.mythx.io
export MYTHX_ETH_ADDRESS=0x(...)
export MYTHX_PASSWORD=password
```

4. Run an analysis:

```
$ cd sabre
$ node sabre.js mycontract.sol 
```

## Usage

See also:

- [Armlet client library](https://github.com/ConsenSys/armlet)
- [MythX documentation](https://docs.mythx.io/en/latest/)
