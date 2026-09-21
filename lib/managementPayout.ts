/** Estimate gross rent and management fee from a net Chase payout deposit. */
export function estimatePayoutSplit(netDeposit:number,feePercent:number){
  const net=Math.max(0,Math.round(Math.abs(netDeposit)));
  const rate=Number(feePercent||0)/100;
  if(rate<=0||rate>=1)return {gross:net,fee:0,net,estimated:false};
  const gross=Math.round(net/(1-rate));
  const fee=Math.max(0,gross-net);
  return {gross,fee,net,estimated:true};
}
