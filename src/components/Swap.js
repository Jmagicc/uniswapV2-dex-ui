import React, { useState, useEffect } from "react";
import { Input, Popover, Radio, Modal, message } from "antd";
import {
  ArrowDownOutlined,
  DownOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import tokenList from "../tokenList.json";
import axios, { formToJSON } from "axios";
import { Pair,Trade,Route } from '@uniswap/v2-sdk'
import {ChainId, Token ,CurrencyAmount,TradeType,Percent} from '@uniswap/sdk-core'
import {infura_connection,pair_abi,router_abi} from '../resource.js'
import { useAccount,useWriteContract} from "wagmi";
import {ethers} from "ethers";



function Swap(props) {
  const [messageApi, contextHolder] = message.useMessage();
  const [slippage, setSlippage] = useState(2.5);
  const [tokenOneAmount, setTokenOneAmount] = useState(null);
  const [tokenTwoAmount, setTokenTwoAmount] = useState(null);
  const [tokenOne, setTokenOne] = useState(tokenList[0]);
  const [tokenTwo, setTokenTwo] = useState(tokenList[1]);
  const [isOpen, setIsOpen] = useState(false);
  const [changeToken, setChangeToken] = useState(1);
  const [prices, setPrices] = useState(null);
  const [txDetails, setTxDetails] = useState({
    to:null,
    data: null,
    value: null,
  }); 

  const {writeContract}=useWriteContract();
  const account=useAccount();
  const {data, sendTransaction} = {}

  const { isLoading, isSuccess } ={}

  function handleSlippageChange(e) {
    setSlippage(e.target.value);
  }

  function changeAmount(e) {
    setTokenOneAmount(e.target.value);
    if(e.target.value && prices){
      setTokenTwoAmount((e.target.value * prices.ratio).toFixed(18))
    }else{
      setTokenTwoAmount(null);
    }
  }

  function switchTokens() {
    setPrices(null);
    setTokenOneAmount(null);
    setTokenTwoAmount(null);
    const one = tokenOne;
    const two = tokenTwo;
    setTokenOne(two);
    setTokenTwo(one);
    fetchPrices(two, one);
  }

  function openModal(asset) {
    setChangeToken(asset);
    setIsOpen(true);
  }

  function modifyToken(i){
    setPrices(null);
    setTokenOneAmount(null);
    setTokenTwoAmount(null);
    if (changeToken === 1) {
      setTokenOne(tokenList[i]);
      fetchPrices(tokenList[i], tokenTwo)
    } else {
      setTokenTwo(tokenList[i]);
      fetchPrices(tokenOne, tokenList[i])
    }
    setIsOpen(false);
  }

  async function createPair(tokenOne,tokenTwo) {
    console.log("创建交易对",tokenOne)
    const tokenOneToken = new Token(ChainId.MAINNET, tokenOne.address, tokenOne.decimals)
    const tokenTwoToken = new Token(ChainId.MAINNET, tokenTwo.address, tokenTwo.decimals)
    const pairAddress = Pair.getAddress(tokenOneToken, tokenTwoToken)
  
    // Setup provider, import necessary ABI ...
    const provider = new ethers.providers.JsonRpcProvider(infura_connection)
    const pairContract = new ethers.Contract(pairAddress, pair_abi, provider)
    const reserves = await pairContract["getReserves"]()
    const [reserve0, reserve1] = reserves
  
    const tokens = [tokenOneToken, tokenTwoToken]
    const [token0, token1] = tokens[0].sortsBefore(tokens[1]) ? tokens : [tokens[1], tokens[0]]
  
    const pair = new Pair(CurrencyAmount.fromRawAmount(token0, reserve0), CurrencyAmount.fromRawAmount(token1, reserve1))
    return pair
  }

  async function fetchPrices(tokenOne, tokenTwo){

      const tokenOneToken =new Token(ChainId.MAINNET, tokenOne.address, tokenOne.decimals);
      const tokenTwoToken =new Token(ChainId.MAINNET, tokenTwo.address, tokenTwo.decimals);

      const pair = await createPair(tokenOneToken, tokenTwoToken);
      const route = new Route([pair], tokenOneToken,tokenTwoToken);

      const tokenOnePrice = await route.midPrice.toSignificant(6);
      const tokenTwoPrice = await route.midPrice.invert().toSignificant(6);

      // const ratio= (tokenOnePrice/tokenTwoPrice);
      const ratio = tokenOnePrice;

      console.log("result:： ",{tokenOnePrice: tokenOnePrice, tokenTwoPrice: tokenTwoPrice, ratio: ratio});

      setPrices({tokenOne: tokenOnePrice, tokenTwo: tokenTwoPrice, ratio: ratio})
  }

  async function approveToken (tokenAddress,amount) {
    const tokenABI=[ {
      "inputs": [
        {
          "internalType": "address",
          "name": "spender",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "approve",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }];

    writeContract({
      address: tokenAddress,
      abi: tokenABI,
      functionName: "approve",
      args: ["TODO", amount],
    },
    {
      onSuccess:(tx) => {
        messageApi.destroy();
        messageApi.info("approve success"+ tx.hash);
        setTxDetails({tx:tx.to,data: tx.data, value:tx.value});
      },  

      onError: (error) =>{
        messageApi.destroy();
        messageApi.error("approve Failed :"+ error.message);

        
      }
    })


  }

  async function fetchDexSwap(){
    const tokenOneToken =new Token(ChainId.MAINNET, tokenOne.address, tokenOne.decimals);
    const tokenTwoToken =new Token(ChainId.MAINNET, tokenTwo.address, tokenTwo.decimals);

    const pair = await createPair(tokenOneToken, tokenTwoToken);
    const route = new Route([pair], tokenOneToken,tokenTwoToken);
    if (tokenOneAmount === null){
      return;
    }


    const amountIn = formatTokenAmount(tokenOneAmount,tokenOne.decimals);

    // const trade = new Trade(
    //   route, 
    //   CurrencyAmount.fromRawAmount(tokenOneToken, amountIn),
    //   TradeType.EXACT_INPUT);

    const tokenTwoOut = (
      (Number(tokenTwoAmount) * (100-slippage))/2.5
    ).toString();

    const amountOutMin = formatTokenAmount(tokenTwoOut,tokenTwo.decimals);
    const path = [tokenOneToken.address,tokenTwoToken.address]
    const to = account.address;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes from the current Unix time

    await approveToken(tokenOne.address,amountIn)


    writeContract({
      address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      abi: router_abi,
      functionName: "swapExactTokensForTokens",
      args: [amountIn,amountOutMin, path, to, deadline],
    },
    {
      onSuccess:(tx) => {
        messageApi.destroy();
        messageApi.info("Swap Successful :"+ tx.hash);
        setTxDetails({tx:tx.to,data: tx.data, value:tx.value});
      },  

      onError: (error) =>{
        messageApi.destroy();
        messageApi.error("Swap Failed :"+ error.message);

        
      }
    })
      
  }




  useEffect(()=>{

    fetchPrices(tokenList[0], tokenList[1])

  }, [])

  const settings = (
    <>
      <div>Slippage Tolerance</div>
      <div>
        <Radio.Group value={slippage} onChange={handleSlippageChange}>
          <Radio.Button value={0.5}>0.5%</Radio.Button>
          <Radio.Button value={2.5}>2.5%</Radio.Button>
          <Radio.Button value={5}>5.0%</Radio.Button>
        </Radio.Group>
      </div>
    </>
  );

  return (
    <>
      {contextHolder}
      <Modal
        open={isOpen}
        footer={null}
        onCancel={() => setIsOpen(false)}
        title="Select a token"
      >
        <div className="modalContent">
          {tokenList?.map((e, i) => {
            return (
              <div
                className="tokenChoice"
                key={i}
                onClick={() => modifyToken(i)}
              >
                <img src={e.img} alt={e.ticker} className="tokenLogo" />
                <div className="tokenChoiceNames">
                  <div className="tokenName">{e.name}</div>
                  <div className="tokenTicker">{e.ticker}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
      <div className="tradeBox">
        <div className="tradeBoxHeader">
        <h4 style={{ color: 'black' }}>Swap Token</h4>
          <Popover
            content={settings}
            title="Settings"
            trigger="click"
            placement="bottomRight"
          >
            <SettingOutlined className="cog" />
          </Popover>
        </div>
        <div className="inputs">
          <Input
            placeholder="0"
            value={tokenOneAmount}
            onChange={changeAmount}
            disabled={!prices}
          />
            <div className="switchButton" onClick={switchTokens}>
            <ArrowDownOutlined className="switchArrow" />
          </div>
          <Input placeholder="0" value={tokenTwoAmount} disabled={true} />
        
          <div className="assetOne" onClick={() => openModal(1)}>
            <img src={tokenOne.img} alt="assetOneLogo" className="assetLogo" />
            {tokenOne.ticker}
            <DownOutlined />
          </div>
          <div className="assetTwo" onClick={() => openModal(2)}>
            <img src={tokenTwo.img} alt="assetOneLogo" className="assetLogo" />
            {tokenTwo.ticker}
            <DownOutlined />
          </div>
        </div>
        <div className="swapButton" disabled={!tokenOneAmount || !account.isConnected} onClick={() => fetchDexSwap()}>Swap</div>
      </div>
    </>
  );
}

export default Swap;


const  formatTokenAmount =(amount, decimals) => {
  const [integgerPart, decimalPart=""] = amount.split(".");

  let combine =integgerPart + decimalPart;

  const paddingLength =decimals -decimalPart.length;

  if (paddingLength > 0){
    combine = combine.padEnd(combine.length + paddingLength, "0");
  }else if (paddingLength < 0){
    combine = combine.slice(0, paddingLength);
  }

  combine =combine.replace(/^0+/,"");
  
  return combine;
}
