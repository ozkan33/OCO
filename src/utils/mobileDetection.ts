export const isMobileBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone',
    'mobile', 'tablet', 'opera mini', 'opera mobi'
  ];
  
  return mobileKeywords.some(keyword => userAgent.includes(keyword));
};

export const isIOS = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

export const isAndroid = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
};

export const isSafari = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
};

export const getMobileBrowserInfo = () => {
  if (typeof window === 'undefined') return null;
  
  return {
    isMobile: isMobileBrowser(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isSafari: isSafari(),
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    screen: {
      width: screen.width,
      height: screen.height,
    },
  };
};

export const handleMobileRedirect = (url: string): void => {
  if (typeof window === 'undefined') return;
  
  try {
    // For mobile browsers, use a more reliable redirect method
    if (isMobileBrowser()) {
      // Use location.replace for mobile to avoid history issues
      window.location.replace(url);
    } else {
      // Use regular href for desktop
      window.location.href = url;
    }
  } catch (error) {
    console.error('Mobile redirect error:', error);
    // Fallback
    window.location.href = url;
  }
}; 