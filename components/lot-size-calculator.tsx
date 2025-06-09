'use client'; // Add this if you're using Next.js 13+ with app router

import { useEffect } from 'react';

// Type declaration for the RemoteCalc function
declare global {
  interface Window {
    RemoteCalc: (config: {
      Url: string;
      TopPaneStyle: string;
      BottomPaneStyle: string;
      ButtonStyle: string;
      TitleStyle: string;
      TextboxStyle: string;
      ContainerWidth: string;
      HighlightColor: string;
      IsDisplayTitle: boolean;
      IsShowChartLinks: boolean;
      IsShowEmbedButton: boolean;
      CompactType: string;
      Calculator: string;
      ContainerId: string;
    }) => void;
  }
}

export function LotSizeCalculator() {
  useEffect(() => {
    // Load the remote script
    const script = document.createElement('script');
    script.src = 'https://www.cashbackforex.com/Content/remote/remote-widgets.js';
    script.async = true;
    document.head.appendChild(script);

    // Initialize the calculator after the script loads
    script.onload = () => {
      // Make sure RemoteCalc is available
      if (typeof window.RemoteCalc === 'function') {
        window.RemoteCalc({
          "Url": "https://www.cashbackforex.com",
          "TopPaneStyle": "YmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KCMwMDAwMDAgMCUsICMyNDI4MzEgMTAwJSk7IGNvbG9yOiB3aGl0ZTsgYm9yZGVyLWJvdHRvbTogbm9uZTs=",
          "BottomPaneStyle": "YmFja2dyb3VuZDogIzE1MTgxZDsgYm9yZGVyOiBzb2xpZCAwcHggIzJhMmUzOTsgY29sb3I6ICM5MTk0YTE7",
          "ButtonStyle": "YmFja2dyb3VuZDogIzM0MzU0MDsgY29sb3I6IHdoaXRlOyBib3JkZXItcmFkaXVzOiAyMHB4Ow==",
          "TitleStyle": "dGV4dC1hbGlnbjogbGVmdDsgZm9udC1zaXplOiA0MHB4OyBmb250LXdlaWdodDogNTAwOw==",
          "TextboxStyle": "YmFja2dyb3VuZDogIzE1MTgxZDsgY29sb3I6ICM5MTk0YTE7IGJvcmRlcjogc29saWQgMHB4ICM5MTk0YTE7",
          "ContainerWidth": "665",
          "HighlightColor": "rgba(0,0,0,1.0)",
          "IsDisplayTitle": false,
          "IsShowChartLinks": false,
          "IsShowEmbedButton": false,
          "CompactType": "large",
          "Calculator": "position-size-calculator",
          "ContainerId": "position-size-calculator-564055"
        });
      }
    };

    // Cleanup function
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <div id="position-size-calculator-564055">
      {/* The widget will be loaded here by the script */}
    </div>
  );
}