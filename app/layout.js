import './globals.css';

export const metadata = {
  title: 'NSS Information Chatbot | National Service Scheme (Govt. of India)',
  description:
    'Retrieval-augmented chatbot for official National Service Scheme (NSS) information, powered by NVIDIA NIM Muse Glimmer 30B.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-amber-100 selection:text-amber-900">
        {children}
      </body>
    </html>
  );
}
