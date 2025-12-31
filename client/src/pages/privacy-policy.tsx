import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl">Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last Updated: January 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
              <p className="text-muted-foreground">
                Twinlite Services Limited ("we," "us," or "our") is committed to protecting your privacy. 
                This Privacy Policy explains how we collect, use, and store personal data when you use the 
                FairSign electronic signature platform (the "Service").
              </p>
              <div className="mt-4 p-4 bg-muted rounded-md">
                <h3 className="font-medium mb-2">Important Notice for Self-Hosted Users:</h3>
                <p className="text-sm text-muted-foreground">
                  This policy applies only to the hosted version of FairSign provided by Twinlite Services Limited 
                  (e.g., at fairsign.app or your custom domain). If you are using a self-hosted instance of our 
                  Open Source software on your own infrastructure, Twinlite Services Limited does not have access 
                  to your data, and the entity hosting that instance is the sole Data Controller.
                </p>
              </div>
              <div className="mt-4 p-4 bg-muted rounded-md">
                <h3 className="font-medium mb-2">Company Information (Data Controller):</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li><strong>Name:</strong> Twinlite Services Limited</li>
                  <li><strong>Address:</strong> 4th Floor, Phibsborough Tower, Dublin, D07 XH2D, Republic of Ireland</li>
                  <li><strong>Phone:</strong> 018273662</li>
                  <li><strong>Email:</strong> support@fairsign.io</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">2. Our Role: Controller vs. Processor</h2>
              <p className="text-muted-foreground mb-3">
                To comply with the General Data Protection Regulation (GDPR), it is important to understand our dual role:
              </p>
              <ul className="text-muted-foreground space-y-2">
                <li>
                  <strong>We are the Data Controller for Account Data.</strong> This is information about our direct 
                  customers (Users) who register to use the Service (e.g., billing details, login credentials).
                </li>
                <li>
                  <strong>We are the Data Processor for Document & Signer Data.</strong> This is the content of the 
                  contracts you upload and the personal details of the people you invite to sign them. We process 
                  this data solely on your instructions to generate the signature. You (the Customer) are the 
                  Controller of this data.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. Data We Collect</h2>
              
              <h3 className="text-lg font-medium mb-2">A. Information You Provide (Account Data)</h3>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside mb-4">
                <li><strong>Registration Details:</strong> Name, email address, password hash.</li>
                <li><strong>Billing Information:</strong> If you subscribe to a Pro Plan, our payment processor (e.g., Stripe) 
                  collects your credit card details. We do not store full credit card numbers on our servers.</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">B. Information Processed on Your Behalf (Document & Signer Data)</h3>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside mb-4">
                <li><strong>Signer Details:</strong> Names and email addresses of people you send documents to.</li>
                <li><strong>Document Content:</strong> The PDF files you upload.</li>
                <li><strong>Signature Data:</strong> The visual representation of signatures, initials, and stamps.</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">C. Automatically Collected Data (Audit Trail & Security)</h3>
              <p className="text-muted-foreground mb-2">
                To ensure the legal validity of electronic signatures under eIDAS (Regulation EU 910/2014), we automatically collect:
              </p>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>IP Addresses:</strong> Of both the sender and the signer.</li>
                <li><strong>Device Information:</strong> Browser type and operating system.</li>
                <li><strong>Timestamps:</strong> Exact time of opening, viewing, and signing a document.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. How and Why We Use Your Data</h2>
              <p className="text-muted-foreground mb-3">
                We rely on the following legal bases for processing under GDPR:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-muted-foreground border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                      <th className="text-left py-2 pr-4 font-medium">Data Type</th>
                      <th className="text-left py-2 font-medium">Legal Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 pr-4">Providing the Service</td>
                      <td className="py-2 pr-4">Account Data, Document Data</td>
                      <td className="py-2">Contractual Necessity</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4">Legal Audit Trails</td>
                      <td className="py-2 pr-4">IP Addresses, Timestamps</td>
                      <td className="py-2">Legal Obligation</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4">Billing & Invoicing</td>
                      <td className="py-2 pr-4">Payment Data</td>
                      <td className="py-2">Legal Obligation & Contract</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4">Security & Fraud Prevention</td>
                      <td className="py-2 pr-4">Logs, Device Info</td>
                      <td className="py-2">Legitimate Interest</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">Customer Support</td>
                      <td className="py-2 pr-4">Email, Name</td>
                      <td className="py-2">Legitimate Interest</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Data Storage and Sub-Processors</h2>
              <p className="text-muted-foreground mb-3">
                We use third-party service providers ("Sub-processors") to provide the Service. 
                We have Data Processing Agreements (DPAs) in place with all providers.
              </p>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside mb-4">
                <li><strong>Hosting & Compute:</strong> Server infrastructure for running the application.</li>
                <li><strong>Database:</strong> PostgreSQL for storing user accounts and audit logs.</li>
                <li><strong>File Storage:</strong> Encrypted storage of PDF documents.</li>
                <li><strong>Transactional Email:</strong> Sending signature requests.</li>
                <li><strong>Payments:</strong> Stripe for processing subscription payments.</li>
              </ul>
              <p className="text-muted-foreground">
                <strong>Data Location:</strong> Our primary data storage is located within the European Economic Area (EEA) 
                or jurisdictions deemed "Adequate" by the European Commission. If data is transferred to the US, 
                we rely on Standard Contractual Clauses (SCCs) to ensure protection.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
              <ul className="text-muted-foreground space-y-2">
                <li>
                  <strong>Account Data:</strong> Retained as long as your account is active. If you delete your account, 
                  we delete your personal info within 30 days, subject to tax/legal retention requirements.
                </li>
                <li>
                  <strong>Signed Documents & Audit Trails:</strong> Because these are legal documents, we retain them 
                  for as long as the User (Controller) keeps them in their account.
                </li>
              </ul>
              <p className="text-muted-foreground mt-2">
                <strong>Note:</strong> If you delete a document, it is soft-deleted immediately and permanently 
                purged from backups within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Your Rights Under GDPR</h2>
              <p className="text-muted-foreground mb-3">You have the following rights regarding your data:</p>
              <ul className="text-muted-foreground space-y-2">
                <li><strong>Right to Access:</strong> Request a copy of the data we hold about you.</li>
                <li><strong>Right to Rectification:</strong> Correct inaccurate data.</li>
                <li>
                  <strong>Right to Erasure ("Right to be Forgotten"):</strong> Request deletion of your data.
                  <p className="text-sm mt-1 ml-4">
                    <em>Limitation:</em> We cannot delete specific Audit Trail data for a signed contract if the 
                    contract is still valid and held by the other party, as this would invalidate the legal proof 
                    of the signature.
                  </p>
                </li>
                <li>
                  <strong>Right to Portability:</strong> Receive your data in a structured, machine-readable format 
                  (e.g., exporting your PDFs).
                </li>
              </ul>
              <p className="text-muted-foreground mt-3">
                To exercise these rights, email us at <strong>support@fairsign.io</strong>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Security Measures</h2>
              <p className="text-muted-foreground mb-2">
                We implement industry-standard security measures, including:
              </p>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>Encryption at Rest:</strong> Documents stored in our storage buckets are encrypted.</li>
                <li><strong>Encryption in Transit:</strong> All traffic is secured via TLS 1.2/1.3 (HTTPS).</li>
                <li><strong>Access Control:</strong> Strict role-based access to internal tools.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">9. Cookies</h2>
              <p className="text-muted-foreground">
                We use essential session cookies to keep you logged in. We do not use third-party tracking 
                cookies for advertising purposes on the signing interface.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">10. Updates to this Policy</h2>
              <p className="text-muted-foreground">
                We may update this policy to reflect changes in law or our technology. We will notify you 
                of significant changes via email or a dashboard notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">11. Contact Authority</h2>
              <p className="text-muted-foreground mb-2">
                If you believe we have infringed your rights, you have the right to lodge a complaint 
                with the Data Protection Commission (DPC) Ireland:
              </p>
              <ul className="text-muted-foreground space-y-1">
                <li><strong>Website:</strong> www.dataprotection.ie</li>
                <li><strong>Address:</strong> 21 Fitzwilliam Square South, Dublin 2, D02 RD28</li>
              </ul>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
