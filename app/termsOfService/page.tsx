"use client"

import "../../styles/lot-size-calculator.css";

export default function TermsOfServicePage() {
    return (
        <div className="flex-1 w-full flex flex-col justify-center items-center">
            <div className="!w-[80vw] lg:!w-[50vw] mt-8 mb-8 px-4 container backdrop-blur-[1px]">
                <div className="body overflow-y-auto max-h-[80vh]">

                    <div className="body-header"><span>Terms of Service for IntelliTrade.tech</span></div>
                    <div className="body-row">
                        <ul>
                        <li>Effective date: November 1, 2025</li>
                        <li>Welcome to IntelliTrade.tech. These Terms of Service (the “Terms”) govern your access to and use of our websites, applications, tools, data, content, and services (collectively, the “Service”). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.</li>
                    </ul>
                    </div>

                    <div className="body-header"><span>1. Overview and Acceptance</span></div>
                    <div className="body-row">
                        <p>These Terms form a binding contract between you and IntelliTrade Technologies, the operator of IntelliTrade.tech. If you are using the Service on behalf of a company or other entity, you represent that you have authority to bind that entity, in which case “you” means that entity.</p>
                    </div>

                    <div className="body-header"><span>2. Definitions</span></div>
                    <div className="body-row">
                        <ul>
                            <li><strong>Account:</strong> a registered user profile that allows access to certain features.</li>
                            <li><strong>Content:</strong> text, images, video, audio, code, data, and other materials available through the Service.</li>
                            <li><strong>Output:</strong> insights, calculations, or other results produced by the Service, including AI‑generated outputs.</li>
                            <li><strong>Subscription:</strong> a paid plan that provides access to premium features for a recurring period.</li>
                        </ul>
                    </div>

                    <div className="body-header"><span>3. Eligibility</span></div>
                    <div className="body-row">
                        <p>You must be at least 18 years of age and capable of entering into a binding contract to use the Service.</p>
                    </div>

                    <div className="body-header"><span>4. Account Registration and Security</span></div>
                    <div className="body-row">
                        <p>You may need an Account to use some features. Provide accurate information and keep it current. You are responsible for maintaining the confidentiality of your credentials and for all activity under your Account. Notify us immediately of suspected unauthorized use.</p>
                    </div>

                    <div className="body-header"><span>5. The Service; Tools and Data</span></div>
                    <div className="body-row">
                        <p>The Service currently includes a premium Lot Size Calculator and may include additional tools such as economic calendars, market news feeds, widgets, trading alerts, AI assistants, and educational content. Some features may depend on third‑party data or services. We may add, modify, or discontinue features at any time.</p>
                    </div>

                    <div className="body-header"><span>6. No Financial Advice; Risk Disclosure</span></div>
                    <div className="body-row">
                        <ul>
                            <li>IntelliTrade does not provide investment, financial, legal, tax, or other professional advice.</li>
                            <li>All tools, calculators, content, and AI outputs are for educational and informational purposes only.</li>
                            <li>They do not constitute an offer or solicitation to buy or sell any financial instrument.</li>
                            <li>Trading involves substantial risk. Past performance, including hypothetical or back‑tested results, does not guarantee future outcomes. You are solely responsible for your decisions and for verifying any Output before acting.</li>
                        </ul>
                    </div>

                    <div className="body-header"><span>7. Market Data, Third‑Party Services, and Outages</span></div>
                    <div className="body-row">
                        <ul>
                            <li>Data and content may be provided by third parties. They may be delayed, incomplete, inaccurate, interrupted, or unavailable.</li>
                            <li>We do not control third-party services and are not responsible for their availability, accuracy, or fees.</li>
                            <li>The Service may experience maintenance windows, network problems, or outages. We do not guarantee continuous operation.</li>
                        </ul>
                    </div>

                    <div className="body-header"><span>8. Acceptable Use</span></div>
                    <div className="body-row">
                        <ul>
                            <li>Violate any applicable law, regulation, or sanction.</li>
                            <li>Scrape, spider, harvest, bulk download, or otherwise copy data or Content except as expressly permitted.</li>
                            <li>Circumvent rate limits, access controls, or security features.</li>
                            <li>Reverse engineer, decompile, or attempt to extract source code.</li>
                            <li>Introduce malware or interfere with the Service’s operation.</li>
                            <li>Use the Service to provide regulated financial advice or to operate a competing service without written consent.</li>
                            <li>Resell, sublicense, or white‑label the Service without our written permission.</li>
                            <li>Frame, mirror, or otherwise impersonate the Service.</li>
                            <li>We may monitor and throttle usage to protect the Service.</li>
                        </ul>
                        
                    </div>

                    <div className="body-header"><span>9. Plans, Billing, Taxes, Refunds, and Cancellations</span></div>
                    <div className="body-row">
                        <ul>
                            <li>Auto-renewal: Paid Subscriptions renew by default for the same term unless you cancel.</li>
                            <li>How to cancel: You can cancel at any time in Account Settings. Cancellation takes effect at the end of the current billing period and you will retain access until then.</li>
                            <li>Refunds: No refunds are provided for partial periods except where required by law.</li>
                            <li>Trials and promo codes: If provided, we may limit eligibility and duration. Trials convert to paid plans unless canceled before the end of the trial.</li>
                            <li>Price changes: We may change prices with at least 30 days’ notice by email or in-app notice.</li>
                            <li>Taxes and VAT: Prices exclude taxes unless stated. You are responsible for any applicable taxes and VAT.</li>
                            <li>Chargebacks: Filing a chargeback may result in immediate suspension of your Account.</li>
                        </ul>
                    </div>

                    <div className="body-header"><span>10. Intellectual Property; License; Feedback</span></div>
                    <div className="body-row">
                        <p>The Service, including Content, design, software, data models, and branding, is owned by IntelliTrade or its licensors and is protected by intellectual property laws. We grant you a limited, non‑exclusive, non‑transferable, revocable license to use the Service for your personal or internal business purposes in accordance with these Terms. We may use any feedback you provide without restriction or obligation.</p>
                    </div>

                    <div className="body-header"><span>11. User Content; Notice-and-Takedown</span></div>
                    <div className="body-row">
                        <p>If you upload or submit content, you represent that you have the rights to do so and that your content does not violate law or third-party rights. We may remove content that we believe violates these Terms. For IP complaints or takedown requests, contact info@intellitrade.tech with your contact details, a description of the work and the allegedly infringing material, the location URL, a statement of good-faith belief, and a statement made under penalty of perjury that you are authorized to act. We will respond promptly in accordance with applicable law.</p>
                    </div>

                    <div className="body-header"><span>12. Privacy, Cookies, and Communications</span></div>
                    <div className="body-row">
                        <p>Your use of the Service is subject to our Privacy Policy and Cookie Policy. These explain what data we collect, how we use it, and your choices. We may send you transactional emails related to your Account and Service. Where required, we will obtain consent for marketing communications and cookies.</p>
                    </div>

                    <div className="body-header"><span>13. AI Outputs & Automation</span></div>
                    <div className="body-row">
                        <p>AI features may generate incorrect, incomplete, or inappropriate outputs. You must review and validate outputs and not rely on them as the sole basis for trading or financial decisions. You are responsible for human oversight of any automated actions you enable.</p>
                    </div>

                    <div className="body-header"><span>14. Disclaimer of Warranties</span></div>
                    <div className="body-row">
                        <p>The Service, including all Content, tools, data, and AI-generated outputs, is provided “as is” and “as available.” To the maximum extent permitted by law, IntelliTrade disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, accuracy, non-infringement, and non-interruption. You assume all risk of use.</p>
                    </div>

                    <div className="body-header"><span>15. Limitation of Liability</span></div>
                    <div className="body-row">
                        <p>To the maximum extent permitted by law, IntelliTrade will not be liable for any indirect, incidental, special, punitive, or consequential damages, or for lost profits, revenues, data, goodwill, or business interruption. In any event, IntelliTrade’s aggregate liability for all claims relating to the Service will not exceed the amounts you paid to IntelliTrade for the Service during the twelve months before the event giving rise to liability. Nothing in these Terms excludes liability that cannot be excluded by law.</p>
                    </div>

                    <div className="body-header"><span>16. Indemnification</span></div>
                    <div className="body-row">
                        <p>You will indemnify, defend, and hold harmless IntelliTrade and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including reasonable legal fees, arising out of or in any way connected with your use of the Service, your violation of these Terms, your violation of law, or your infringement of any third-party right.</p>
                    </div>

                    <div className="body-header"><span>17. Compliance, Sanctions, and Export Control</span></div>
                    <div className="body-row">
                        <p>You may not use the Service if you are subject to sanctions or are in a country embargoed by the EU, the United States, or other applicable jurisdictions. You agree to comply with all export control and sanctions laws and to ensure that the Service is not used for prohibited purposes.</p>
                    </div>

                    <div className="body-header"><span>18. Beta and Experimental Features</span></div>
                    <div className="body-row">
                        <p>From time to time we may offer beta or experimental features. These may be incomplete, may change, and may be withdrawn at any time. They are provided as is and are subject to these Terms.</p>
                    </div>

                    <div className="body-header"><span>19. Termination and Suspension</span></div>
                    <div className="body-row">
                        <p>We may suspend or terminate your access to the Service at any time if we believe you have violated these Terms or pose a risk to the Service or other users. You may stop using the Service at any time. Sections that by their nature should survive termination will survive, including Sections 10 through 28.</p>
                    </div>

                    <div className="body-header"><span>20. Governing Law and Venue</span></div>
                    <div className="body-row">
                        <p>These Terms are governed by the laws of the Netherlands. The courts of Amsterdam, the Netherlands have exclusive jurisdiction and venue for disputes, subject to any mandatory consumer protections that apply in your country of residence.</p>
                    </div>

                    <div className="body-header"><span>21. EU and EEA Consumer Information</span></div>
                    <div className="body-row">
                        <ul>
                            <li>You may have statutory rights that cannot be waived.</li>
                            <li>You may bring claims in the courts of your place of residence where required by law.</li>
                            <li>You can access the European Commission’s Online Dispute Resolution platform at <a href="https://ec.europa.eu/odr" className="text-blue-600 underline">https://ec.europa.eu/odr</a>.</li>
                            <li>For digital content delivered immediately upon purchase, the 14-day withdrawal right may not apply once delivery begins with your express consent.</li>
                        </ul>
                    </div>

                    <div className="body-header"><span>22. Force Majeure</span></div>
                    <div className="body-row">
                        <p>We will not be liable for delays or failures caused by events beyond our reasonable control, including natural disasters, acts of government, labor disputes, internet failures, and third-party service outages.</p>
                    </div>

                    <div className="body-header"><span>23. Assignment</span></div>
                    <div className="body-row">
                        <p>You may not assign or transfer these Terms or your rights under them without our prior written consent. We may assign these Terms in connection with a merger, acquisition, corporate reorganization, or sale of assets.</p>
                    </div>

                    <div className="body-header"><span>24. Severability</span></div>
                    <div className="body-row">
                        <p>If any provision is held to be invalid or unenforceable, the remaining provisions will remain in full force and effect.</p>
                    </div>

                    <div className="body-header"><span>25. Waiver</span></div>
                    <div className="body-row">
                        <p>Failure to enforce a provision is not a waiver of our right to enforce it later.</p>
                    </div>

                    <div className="body-header"><span>26. Notices</span></div>
                    <div className="body-row">
                        <p>We may provide notices by email, in-app messages, or by posting on the Service. You consent to receive notices electronically.</p>
                    </div>

                    <div className="body-header"><span>27. Changes to These Terms</span></div>
                    <div className="body-row">
                        <p>We may modify these Terms. Material changes will be notified at least 14 days before they take effect, by email or in-app notice. Your continued use of the Service after the effective date constitutes acceptance of the changes.</p>
                    </div>

                    <div className="body-header"><span>28. Contact and Legal Entity Information</span></div>
                    <div className="body-row">
                        <ul>
                            <li>Operator: IntelliTrade Technologies</li>
                            <li>Business correspondence address: Parnassusweg 298, 1076 AV Amsterdam, Netherlands</li>
                            <li>Email: info@intellitrade.tech</li>
                        </ul>
                    </div>

                    <div className="body-header"><span>Summary of Key Disclaimers</span></div>
                    <div className="body-row">
                        <ul>
                            <li>No financial advice and no fiduciary duty.</li>
                            <li>AI outputs and market data may be incorrect or delayed.</li>
                            <li>Service provided as is without warranties.</li>
                            <li>Liability is limited and you are responsible for your decisions.</li>
                        </ul>
                    </div>

                </div>
            </div>
        </div>
    );
}
