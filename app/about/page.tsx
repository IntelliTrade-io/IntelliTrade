import '@/styles/lot-size-calculator.css'



export default function Page({}) {

  return (
    <>
       <div className={`w-[80vw] lg:w-[60vw] mt-8 mb-8 px-4 lot-size-container backdrop-blur-[1px]`}>
      {/* <div className="top-light"></div> */}
      <div className="button-backdrop"></div>
      <div className="body overflow-auto text-center">
        <div className="body-header !text-2xl"><span>About IntelliTrade</span></div>
        <div className="body-header"><span>Where Smarter Trading Starts </span></div>
        <div className='body-row justify-center items-center'>
            <ul>
                <li><span>IntelliTrade is a modern trading analysis platform built to help you make educated, professional-grade decisions with more clarity and less noise.</span></li>
                <li><span>We focus on tools serious retail traders actually need. Structured analysis, clean workflows, and risk-first utilities that support disciplined execution. </span></li>
            </ul>
        </div>
        <br/>
        <div className="body-header"><span>Our Mission</span></div>
        <div className='body-row justify-center items-center'>
            <ul>
                <li><span>Trading gets easier when your process gets clearer.</span></li>
                <li><span>Our mission is to give traders a professional analysis toolkit that improves decision-making through better context, better structure, and better risk management. The goal is to help you operate with more confidence and consistency over time.</span></li>
            </ul>
        </div>

        <div className="body-header"><span>What We Build</span></div>

<div className="body-header"><span>Available now</span></div>



        <div className='body-row justify-center items-center'>
            <ul>
                <li><span>Position Size Calculator.</span></li>
                <li><span>A practical risk tool designed to help you size positions with more precision and control. Built for speed, clarity, and real-world usability. </span></li>
                <br/>
                <li><span>Fundamental Analysis Blog.</span></li>
                <li><span>Research-driven breakdowns of the macro and fundamental forces moving markets. Clear context built to support better decisions, without telling you what to trade.</span></li>
            </ul>
        </div>

<div className="body-header"><span>Coming soon</span></div>


   <div className='body-row justify-center items-center'>
            <ul>
                <li><span>IntelliTrade is actively expanding. We are building additional tools and features designed to support a complete analysis workflow, from preparation to execution to review. </span></li>
            </ul>
        </div>

<div className="body-header"><span>Who IntelliTrade Is For</span></div>
   <div className='body-row justify-center items-center'>
            <ul>
                <li><span>IntelliTrade is built for traders who want: </span></li>
                <li><span>A more structured way to analyze markets.</span></li>
                <li><span>Tools that support educated decisions, not impulsive trades.</span></li>
                <li><span>A platform that values professional standards over hype.</span></li>
                <li><span>A long-term approach focused on process, risk, and consistency.</span></li>
            </ul>
        </div>


<div className="body-header"><span>Our Principles </span></div>

<div className='body-row justify-center items-center'>
            <ul>
                <li><span>Clarity over complexity.</span></li>
                <li><span>If it is not clear, it is not useful.</span></li>
                <br/>
                <li><span>Risk-first mindset.</span></li>
                <li><span>Good trading starts with risk management, not predictions.</span></li>
                <br/>
                <li><span>Professional tone.</span></li>
                <li><span>We aim to be calm, precise, and useful.</span></li>
                <br/>
                <li><span>Tools that earn trust.</span></li>
                <li><span>We would rather build fewer things with higher quality than ship a large list of half-finished features.</span></li>
                
            </ul>
        </div>


<div className="body-header"><span>Our Story</span></div>
<div className='body-row justify-center items-center'>
            <ul>
                <li><span>IntelliTrade was founded in 2025 with a simple goal: bring a more professional, modern experience to retail trading tools. The kind of clarity and structure traders expect from institutional-grade workflows. </span></li>
                <li><span>We are building step by step, with quality as the priority. </span></li>
            </ul>
        </div>


<div className="body-header"><span>Important Note</span></div>
<div className='body-row justify-center items-center'>
            <ul>
                <li><span>IntelliTrade provides general, educational market commentary and analysis tools. We do not provide investment advice, and nothing on this site should be interpreted as a trading signal.</span></li>
                <li><span>More information and additional disclaimers are available in our Terms of Service.</span></li>
                <li><span>Stay in the Loop.</span></li>
                <li><span>Want to see what we’re building? Subscribe to our newsletter to stay in the loop when new tools get dropped.</span></li>
            </ul>
        </div>




      </div>
      </div>
    </>
  )
}