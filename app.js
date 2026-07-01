const CHAINS = {
    ethereum: { id: 1, name: 'Ethereum', shortName: 'ETH', icon: '🔷', color: '#627EEA', rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY', explorer: 'https://etherscan.io', contractAddress: '0x...', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
    sepolia: { id: 11155111, name: 'Sepolia', shortName: 'SEP', icon: '🔷', color: '#627EEA', rpcUrl: 'https://rpc.sepolia.org', explorer: 'https://sepolia.etherscan.io', contractAddress: '0x1234567890123456789012345678901234567890', nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 } },
    polygon: { id: 137, name: 'Polygon', shortName: 'MATIC', icon: '💜', color: '#8247E5', rpcUrl: 'https://polygon-rpc.com', explorer: 'https://polygonscan.com', contractAddress: '0x...', nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 } },
    arbitrum: { id: 42161, name: 'Arbitrum', shortName: 'ARB', icon: '🔵', color: '#28A0F0', rpcUrl: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io', contractAddress: '0x...', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
    base: { id: 8453, name: 'Base', shortName: 'BASE', icon: '🔵', color: '#0052FF', rpcUrl: 'https://mainnet.base.org', explorer: 'https://basescan.org', contractAddress: '0x...', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
    bsc: { id: 56, name: 'BSC', shortName: 'BNB', icon: '🟡', color: '#F0B90B', rpcUrl: 'https://bsc-dataseed.binance.org', explorer: 'https://bscscan.com', contractAddress: '0x...', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 } }
};

let selectedChain = 'sepolia';
let provider = null, signer = null, userAddress = null, isConnected = false, walletType = null, wcProvider = null;

function init() { renderChainSelector(); checkPreviousConnection(); }

function renderChainSelector() {
    const container = document.getElementById('chainSelector');
    container.innerHTML = '';
    Object.entries(CHAINS).forEach(([key, chain]) => {
        const btn = document.createElement('button');
        btn.className = `chain-card flex flex-col items-center p-3 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 cursor-pointer ${key === selectedChain ? 'active' : ''}`;
        btn.onclick = () => selectChain(key);
        btn.innerHTML = `<span class="text-2xl mb-1">${chain.icon}</span><span class="text-xs font-medium text-slate-300">${chain.shortName}</span>`;
        container.appendChild(btn);
    });
}

function selectChain(chainKey) {
    selectedChain = chainKey;
    renderChainSelector();
    const chain = CHAINS[chainKey];
    const iconEl = document.getElementById('selectedChainIcon');
    if (iconEl) iconEl.style.backgroundColor = chain.color;
    const nameEl = document.getElementById('selectedChainName');
    if (nameEl) nameEl.textContent = chain.name;
    if (isConnected && walletType === 'metamask') switchNetwork(chainKey);
    showToast(`Switched to ${chain.name}`, 'info');
}

function openWalletModal() {
    document.getElementById('walletModal').classList.remove('hidden');
    document.getElementById('walletOptions').classList.remove('hidden');
    document.getElementById('wcQrDisplay').classList.add('hidden');
}

function closeWalletModal() {
    document.getElementById('walletModal').classList.add('hidden');
    document.getElementById('walletOptions').classList.remove('hidden');
    document.getElementById('wcQrDisplay').classList.add('hidden');
}

async function connectMetaMask() {
    closeWalletModal();
    try {
        if (typeof window.ethereum === 'undefined') { showToast('MetaMask not installed', 'error'); window.open('https://metamask.io/download/', '_blank'); return; }
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
        signer = provider.getSigner();
        userAddress = accounts[0];
        walletType = 'metamask';
        await switchNetwork(selectedChain);
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', (chainId) => {
            const newChainId = parseInt(chainId, 16);
            const chainEntry = Object.entries(CHAINS).find(([_, c]) => c.id === newChainId);
            if (chainEntry) { selectedChain = chainEntry[0]; renderChainSelector(); }
            updateUIConnected();
        });
        isConnected = true;
        updateUIConnected();
        showToast('Connected to MetaMask', 'success');
        localStorage.setItem('walletConnection', JSON.stringify({ type: 'metamask', address: userAddress, chain: selectedChain }));
    } catch (error) { console.error('MetaMask error:', error); showToast(error.message || 'Failed to connect', 'error'); }
}

async function connectWalletConnect() {
    document.getElementById('walletOptions').classList.add('hidden');
    document.getElementById('wcQrDisplay').classList.remove('hidden');
    try {
        wcProvider = await window.EthereumProvider.init({
            projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
            chains: [CHAINS[selectedChain].id],
            showQrModal: false,
            methods: ['eth_sendTransaction', 'eth_signTypedData_v4', 'personal_sign'],
            events: ['chainChanged', 'accountsChanged'],
            metadata: { name: 'Legit Airdrop Claim', description: 'Gasless multi-chain token claims', url: window.location.origin, icons: [`${window.location.origin}/icon.png`] }
        });
        await wcProvider.enable();
        const uri = wcProvider.uri;
        if (uri) { displayQRCode(uri); document.getElementById('wcUri').value = uri; }
        wcProvider.on('connect', async (payload) => {
            provider = new ethers.providers.Web3Provider(wcProvider);
            signer = provider.getSigner();
            const accounts = await provider.listAccounts();
            userAddress = accounts[0]; walletType = 'walletconnect'; isConnected = true;
            closeWalletModal(); updateUIConnected(); showToast('Connected via WalletConnect', 'success');
            localStorage.setItem('walletConnection', JSON.stringify({ type: 'walletconnect', address: userAddress, chain: selectedChain }));
        });
        wcProvider.on('disconnect', () => disconnectWallet());
        wcProvider.on('accountsChanged', (accounts) => { if (accounts.length === 0) disconnectWallet(); else { userAddress = accounts[0]; updateUIConnected(); } });
        wcProvider.on('chainChanged', (chainId) => { const newChainId = parseInt(chainId); const chainEntry = Object.entries(CHAINS).find(([_, c]) => c.id === newChainId); if (chainEntry) { selectedChain = chainEntry[0]; renderChainSelector(); } });
    } catch (error) { console.error('WC error:', error); showToast(error.message || 'Connection failed', 'error'); document.getElementById('walletOptions').classList.remove('hidden'); document.getElementById('wcQrDisplay').classList.add('hidden'); }
}

function displayQRCode(uri) {
    const container = document.getElementById('wcQrCode');
    container.innerHTML = '';
    new QRCode(container, { text: uri, width: 224, height: 224, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

function copyWcUri() { navigator.clipboard.writeText(document.getElementById('wcUri').value).then(() => showToast('URI copied', 'success')); }

async function connectCoinbase() {
    closeWalletModal();
    try {
        const coinbaseWallet = window.coinbaseWalletExtension || (window.ethereum?.isCoinbaseWallet ? window.ethereum : null);
        if (!coinbaseWallet && !window.ethereum) { showToast('Opening Coinbase...', 'info'); await connectWalletConnect(); return; }
        const providerToUse = coinbaseWallet || window.ethereum;
        const accounts = await providerToUse.request({ method: 'eth_requestAccounts' });
        provider = new ethers.providers.Web3Provider(providerToUse, 'any');
        signer = provider.getSigner();
        userAddress = accounts[0]; walletType = 'coinbase';
        await switchNetwork(selectedChain);
        providerToUse.on('accountsChanged', handleAccountsChanged);
        providerToUse.on('chainChanged', () => window.location.reload());
        isConnected = true; updateUIConnected(); showToast('Connected to Coinbase', 'success');
        localStorage.setItem('walletConnection', JSON.stringify({ type: 'coinbase', address: userAddress, chain: selectedChain }));
    } catch (error) { console.error('Coinbase error:', error); showToast(error.message || 'Failed to connect', 'error'); }
}

async function switchNetwork(chainKey) {
    const chain = CHAINS[chainKey];
    if (walletType === 'metamask' || walletType === 'coinbase') {
        try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chain.id.toString(16)}` }] }); }
        catch (switchError) {
            if (switchError.code === 4902) {
                try { await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: `0x${chain.id.toString(16)}`, chainName: chain.name, rpcUrls: [chain.rpcUrl], nativeCurrency: chain.nativeCurrency, blockExplorerUrls: [chain.explorer] }] }); }
                catch (addError) { console.error('Add chain failed:', addError); }
            }
        }
    } else if (walletType === 'walletconnect' && wcProvider) {
        try { await wcProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chain.id.toString(16)}` }] }); }
        catch (error) { console.error('WC switch error:', error); }
    }
}

async function claimTokens() {
    if (!isConnected || !signer) { showToast('Please connect wallet first', 'error'); return; }
    const chain = CHAINS[selectedChain];
    const claimBtn = document.getElementById('claimBtn');
    const claimBtnText = document.getElementById('claimBtnText');
    const claimBtnSpinner = document.getElementById('claimBtnSpinner');
    try {
        claimBtn.disabled = true;
        claimBtnText.textContent = 'Preparing...';
        claimBtnSpinner.classList.remove('hidden');
        const domain = { name: 'LegitAirdrop', version: '1', chainId: chain.id, verifyingContract: chain.contractAddress };
        const types = { Claim: [{ name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'chainId', type: 'uint256' }] };
        const amount = ethers.utils.parseEther('1000');
        const nonce = Date.now();
        const value = { recipient: userAddress, amount, nonce, chainId: chain.id };
        claimBtnText.textContent = 'Sign in Wallet...';
        let signature;
        if (walletType === 'walletconnect') {
            const typedData = JSON.stringify({ types: { EIP712Domain: [], ...types }, domain, primaryType: 'Claim', message: value });
            signature = await wcProvider.request({ method: 'eth_signTypedData_v4', params: [userAddress, typedData] });
        } else { signature = await signer._signTypedData(domain, types, value); }
        claimBtnText.textContent = 'Submitting...';
        const response = await submitToRelayer({ chain: selectedChain, chainId: chain.id, recipient: userAddress, amount: amount.toString(), nonce, signature });
        if (response.success) showSuccess(response.txHash, chain);
        else throw new Error(response.error || 'Submission failed');
    } catch (error) {
        console.error('Claim error:', error);
        if (error.code === 4001 || error.message?.includes('rejected')) showError('Signature rejected');
        else showError(error.message || 'Claim failed');
    } finally { claimBtn.disabled = false; claimBtnSpinner.classList.add('hidden'); }
}

async function submitToRelayer(data) {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log('Relayer received:', data);
            resolve({ success: true, txHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('') });
        }, 2500);
    });
}

function updateUIConnected() {
    document.getElementById('notConnected').classList.add('hidden');
    document.getElementById('connected').classList.remove('hidden');
    document.getElementById('walletDisplay').classList.remove('hidden');
    document.getElementById('walletDisplay').classList.add('flex');
    document.getElementById('networkBadge').classList.remove('hidden');
    document.getElementById('networkBadge').classList.add('flex');
    document.getElementById('walletAddress').textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    document.getElementById('currentNetwork').textContent = CHAINS[selectedChain].name;
    const chain = CHAINS[selectedChain];
    const iconEl = document.getElementById('selectedChainIcon');
    if (iconEl) iconEl.style.backgroundColor = chain.color;
    const nameEl = document.getElementById('selectedChainName');
    if (nameEl) nameEl.textContent = chain.name;
}

function showSuccess(txHash, chain) {
    document.getElementById('connected').classList.add('hidden');
    document.getElementById('success').classList.remove('hidden');
    document.getElementById('txLink').href = `${chain.explorer}/tx/${txHash}`;
    showToast('Tokens claimed!', 'success');
}

function showError(message) {
    document.getElementById('connected')?.classList.add('hidden');
    document.getElementById('notConnected')?.classList.add('hidden');
    document.getElementById('success')?.classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;
}

function resetClaim() {
    document.getElementById('error').classList.add('hidden');
    document.getElementById('success').classList.add('hidden');
    if (isConnected) { document.getElementById('connected').classList.remove('hidden'); document.getElementById('claimBtnText').textContent = 'Claim 1,000 LEGIT'; }
    else document.getElementById('notConnected').classList.remove('hidden');
}

function handleAccountsChanged(accounts) { if (accounts.length === 0) disconnectWallet(); else { userAddress = accounts[0]; updateUIConnected(); } }

async function disconnectWallet() {
    isConnected = false; provider = null; signer = null; userAddress = null; walletType = null;
    if (wcProvider) { await wcProvider.disconnect(); wcProvider = null; }
    localStorage.removeItem('walletConnection');
    document.getElementById('connected').classList.add('hidden');
    document.getElementById('success').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('notConnected').classList.remove('hidden');
    document.getElementById('walletDisplay').classList.add('hidden');
    document.getElementById('walletDisplay').classList.remove('flex');
    document.getElementById('networkBadge').classList.add('hidden');
    document.getElementById('networkBadge').classList.remove('flex');
    showToast('Wallet disconnected', 'info');
}

async function checkPreviousConnection() {
    const saved = localStorage.getItem('walletConnection');
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        if (data.type === 'metamask' && typeof window.ethereum !== 'undefined') {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0 && accounts[0].toLowerCase() === data.address.toLowerCase()) {
                selectedChain = data.chain || 'sepolia'; renderChainSelector(); await connectMetaMask();
            }
        }
    } catch (e) { localStorage.removeItem('walletConnection'); }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    const colors = { success: 'bg-green-500/10 border-green-500/30 text-green-400', error: 'bg-red-500/10 border-red-500/30 text-red-400', info: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' };
    const icons = { success: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>', error: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>', info: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' };
    toast.className = `toast flex items-center space-x-3 px-5 py-3 rounded-xl border ${colors[type]} backdrop-blur-sm shadow-lg max-w-sm`;
    toast.innerHTML = `${icons[type]}<span class="text-sm font-medium">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 4000);
}

window.addEventListener('DOMContentLoaded', init);
