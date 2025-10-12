'use client';
import { useState } from "react";
import "../styles/lot-size-calculator.css";

export default function LotSizeCalculator() {
  const [currency, setCurrency] = useState("EUR");
  const [pair, setPair] = useState("EURUSD");
  const [balance, setBalance] = useState("");
  const [riskPercent, setRiskPercent] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  const [positionSize, setPositionSize] = useState("");
  const [riskAmount, setRiskAmount] = useState("");
  const [pipValue, setPipValue] = useState("");

  const handleCalculate = () => {
    const balanceNum = parseFloat(balance);
    const riskPercentNum = parseFloat(riskPercent);
    const stopLossNum = parseFloat(stopLoss);

    if (isNaN(balanceNum) || isNaN(riskPercentNum) || isNaN(stopLossNum)) {
      alert("Please fill all required fields with valid numbers");
      return;
    }

    const riskAmt = (balanceNum * (riskPercentNum / 100)).toFixed(2);
    const pipVal = (parseFloat(riskAmt) / stopLossNum).toFixed(2);
    const posSize = (parseFloat(pipVal) * 10000).toFixed(2);

    setRiskAmount(`${riskAmt} ${currency}`);
    setPipValue(`${pipVal} ${currency}`);
    setPositionSize(`${posSize} units`);
  };

  return (
    <div className="!max-w-[80vw] lg:!max-w-[50vw] mt-8 mb-8 px-4 container backdrop-blur-[1px] ">
      <div className="top-light"></div>

      <div className="body">
        {/* Trade parameters */}
        <div className="body-header"><span>Trade parameters</span></div>

        <div className="body-row">
          <div className="body-row-1">Account currency</div>
          <div className="body-row-2">
            <select
              className="currency-input backdrop-blur-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="JPY">JPY</option>
              <option value="CHF">CHF</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>

        <div className="body-row">
          <div className="body-row-1">Currency pair</div>
          <div className="body-row-2">
            <select
              className="currency-pair-input backdrop-blur-sm"
              value={pair}
              onChange={(e) => setPair(e.target.value)}
            >
              <option value="EURUSD">EURUSD</option>
              <option value="GBPUSD">GBPUSD</option>
              <option value="USDJPY">USDJPY</option>
              <option value="AUDUSD">AUDUSD</option>
              <option value="USDCAD">USDCAD</option>
              <option value="USDCHF">USDCHF</option>
              <option value="NZDUSD">NZDUSD</option>
              <option value="EURGBP">EURGBP</option>
              <option value="EURJPY">EURJPY</option>
              <option value="GBPJPY">GBPJPY</option>
              <option value="XAUUSD">XAUUSD</option>
              <option value="XAGUSD">XAGUSD</option>
              <option value="WTIUSD">WTIUSD</option>
              <option value="BTCUSD">BTCUSD</option>
              <option value="ETHUSD">ETHUSD</option>
            </select>
          </div>
        </div>

        <div className="body-row">
          <div className="body-row-1">Account balance</div>
          <div className="body-row-2">
            <input
              type="number"
              className="number-input backdrop-blur-sm"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>
        </div>

        <div className="body-row">
          <div className="body-row-1">Risk percentage</div>
          <div className="body-row-2">
            <input
              type="number"
              className="number-input backdrop-blur-sm"
              value={riskPercent}
              onChange={(e) => setRiskPercent(e.target.value)}
            />
          </div>
        </div>

        <div className="body-row-5">
          <div className="body-row-1">Stop loss (pips)</div>
          <div className="body-row-2">
            <input
              type="number"
              className="number-input backdrop-blur-sm"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
            />
          </div>
        </div>

        {/* Calculate button */}
        <div className="body-row-5 justify-center">
          <input
            type="button"
            className="submit-button backdrop-blur-sm"
            value="Calculate"
            onClick={handleCalculate}
          />
          {/* Add your fancy SVG/button effects here if needed */}
        </div>

        {/* Trade details */}
        <div className="body-header"><span>Trade details</span></div>
        <div className="body-row">
          <div className="body-row-1">Position size</div>
          <div className="body-row-2"><span>{positionSize}</span></div>
        </div>
        <div className="body-row">
          <div className="body-row-1">Risk amount</div>
          <div className="body-row-2"><span>{riskAmount}</span></div>
        </div>
        <div className="body-row">
          <div className="body-row-1">Pip value</div>
          <div className="body-row-2"><span>{pipValue}</span></div>
        </div>
      </div>
    </div>
  );
}
