'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './marketplace.module.scss';

// Import the type from our API
import { MarketplaceListing } from '../api/marketplace/list-repo/route';

export default function Marketplace() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [featuredRepo, setFeaturedRepo] = useState<MarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeSold, setIncludeSold] = useState(false);

  // Fetch listings when component mounts
  useEffect(() => {
    const fetchListings = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch listings from our API that now uses Firestore
        const response = await fetch('/api/marketplace/listings');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const fetchedListings = data.listings || [];
        setListings(fetchedListings);
        
        // Select a random repo to feature (excluding sold ones)
        const availableRepos = fetchedListings.filter((repo: MarketplaceListing) => !repo.sold);
        if (availableRepos.length > 0) {
          const randomIndex = Math.floor(Math.random() * availableRepos.length);
          setFeaturedRepo(availableRepos[randomIndex]);
        }
      } catch (err) {
        console.error('Error fetching marketplace listings:', err);
        setError('Failed to load listings. Please try again later.');
        setListings([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchListings();
  }, []);

  return (
    <div className={styles.marketplaceContainer}>
      <div className={styles.header}>
        <h1>GitHub Repository Marketplace</h1>
        <Link href="/marketplace/sell" className={styles.listButton}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          List a Repo to Sell
        </Link>
      </div>

      {error && (
        <div className={styles.error}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.2rem', height: '1.2rem', marginRight: '0.5rem' }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {error}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" style={{ animation: 'spin 1s linear infinite', marginRight: '0.5rem' }}>
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
          Loading repositories...
        </div>
      ) : listings.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>No repositories available</h2>
          <p>Be the first to list a repository for sale!</p>
          <Link href="/marketplace/sell" className={styles.sellButton}>
            List a Repository
          </Link>
        </div>
      ) : (
        <>
          {/* Featured Repository */}
          {featuredRepo && (
            <div className={styles.featuredRepo}>
              <div className={styles.featuredImage}>
                <Image 
                  src={featuredRepo.imageUrl} 
                  alt={featuredRepo.name}
                  fill
                  style={{ objectFit: 'cover' }}
                  priority
                />
                {featuredRepo.sold && (
                  <div className={styles.soldBadge}>
                    Sold
                  </div>
                )}
              </div>
              <div className={styles.featuredContent}>
                <span className={styles.featuredBadge}>Featured Repository</span>
                <div className={styles.featuredHeader}>
                  <h2>{featuredRepo.name}</h2>
                  <div>
                    {featuredRepo.isSubscription ? (
                      <div className={styles.featuredPrice}>${featuredRepo.subscriptionPrice}/mo</div>
                    ) : (
                      <div className={styles.featuredPrice}>${featuredRepo.price}</div>
                    )}
                  </div>
                </div>
                <p className={styles.featuredDescription}>
                  {featuredRepo.description}
                </p>
                <div className={styles.featuredFooter}>
                  <div className={styles.featuredSeller}>
                    <div className={styles.avatar}>
                      <Image 
                        src={featuredRepo.seller.avatarUrl} 
                        alt={featuredRepo.seller.username}
                        width={32}
                        height={32}
                      />
                    </div>
                    @{featuredRepo.seller.username}
                  </div>
                  <div className={styles.featuredStats}>
                    <div className={styles.stat}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                      </svg>
                      {featuredRepo.stars}
                    </div>
                    <div className={styles.stat}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="6" y1="3" x2="6" y2="15"></line>
                        <circle cx="18" cy="6" r="3"></circle>
                        <circle cx="6" cy="18" r="3"></circle>
                        <path d="M18 9a9 9 0 0 1-9 9"></path>
                      </svg>
                      {featuredRepo.forks}
                    </div>
                  </div>
                </div>
                <div className={styles.featuredAction}>
                  <Link href={`/marketplace/buy/${featuredRepo.docId || featuredRepo.id}`}>
                    <button className={styles.buyButton} disabled={featuredRepo.sold}>
                      {featuredRepo.sold 
                        ? 'Sold Out' 
                        : featuredRepo.isSubscription 
                          ? 'Subscribe' 
                          : 'Buy Now'
                      }
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className={styles.filters}>
            <button 
              className={`${styles.filter} ${activeFilter === 'all' ? styles.active : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All Repositories
            </button>
            <button 
              className={`${styles.filter} ${activeFilter === 'onetime' ? styles.active : ''}`}
              onClick={() => setActiveFilter('onetime')}
            >
              One-time Purchase
            </button>
            <button 
              className={`${styles.filter} ${activeFilter === 'subscription' ? styles.active : ''}`}
              onClick={() => setActiveFilter('subscription')}
            >
              Subscription
            </button>
            <label className={styles.toggleLabel}>
              <input 
                type="checkbox" 
                checked={includeSold}
                onChange={() => setIncludeSold(!includeSold)}
                className={styles.toggleInput}
              />
              Include Sold
            </label>
          </div>

          <div className={styles.grid}>
            {listings
              .filter(repo => {
                // Exclude the featured repo
                if (featuredRepo && repo.id === featuredRepo.id) return false;
                
                // First filter by type (all, onetime, subscription)
                if (activeFilter === 'onetime' && repo.isSubscription) return false;
                if (activeFilter === 'subscription' && !repo.isSubscription) return false;
                
                // Then filter sold status
                if (!includeSold && repo.sold) return false;
                
                return true;
              })
              .map(repo => (
                <div key={repo.id} className={styles.card}>
                  <div className={styles.cardImage}>
                    <Image 
                      src={repo.imageUrl} 
                      alt={repo.name}
                      width={600}
                      height={400}
                      layout="responsive"
                    />
                    {repo.sold && (
                      <div className={styles.soldBadge}>
                        Sold
                      </div>
                    )}
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.cardHeader}>
                      <h2 className={styles.repoName}>{repo.name}</h2>
                      <div>
                        {repo.isSubscription ? (
                          <div className={styles.price}>${repo.subscriptionPrice}/mo</div>
                        ) : (
                          <div className={styles.price}>${repo.price}</div>
                        )}
                        {repo.isSubscription && (
                          <div className={styles.subscription}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2v20M2 12h20"></path>
                            </svg>
                            Subscription
                          </div>
                        )}
                      </div>
                    </div>
                    <p className={styles.description}>{repo.description}</p>
                    <div className={styles.cardFooter}>
                      <div className={styles.seller}>
                        <div className={styles.avatar}>
                          <Image 
                            src={repo.seller.avatarUrl} 
                            alt={repo.seller.username}
                            width={24}
                            height={24}
                          />
                        </div>
                        @{repo.seller.username}
                      </div>
                      <div className={styles.stats}>
                        <div className={styles.stat}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                          </svg>
                          {repo.stars}
                        </div>
                        <div className={styles.stat}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="6" y1="3" x2="6" y2="15"></line>
                            <circle cx="18" cy="6" r="3"></circle>
                            <circle cx="6" cy="18" r="3"></circle>
                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                          </svg>
                          {repo.forks}
                        </div>
                      </div>
                    </div>
                    <Link href={`/marketplace/buy/${repo.docId || repo.id}`}>
                      <button className={styles.buyButton} disabled={repo.sold}>
                        {repo.sold 
                          ? 'Sold Out' 
                          : repo.isSubscription 
                            ? 'Subscribe' 
                            : 'Buy Now'
                        }
                      </button>
                    </Link>
                  </div>
                </div>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}
