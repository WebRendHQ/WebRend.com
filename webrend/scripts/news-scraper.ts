import OpenAI from 'openai';
import fetch from 'node-fetch';
import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Initialize Firebase if not already initialized
let db: admin.firestore.Firestore;
if (admin.apps.length === 0) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    
    db = admin.firestore();
    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    process.exit(1);
  }
} else {
  db = admin.firestore();
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// News API configuration
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_URL = 'https://newsapi.org/v2/top-headlines';
// Alternative news sources as fallbacks
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GNEWS_API_URL = 'https://gnews.io/api/v4/top-headlines';
// NewsData.io configuration
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY || process.env.NEWS_API_KEY; // Use NEWS_API_KEY as fallback
const NEWSDATA_API_URL = 'https://newsdata.io/api/1/news';

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: {
    name: string;
  };
  publishedAt: string;
  content?: string;
}

interface GeneratedArticle {
  title: string;
  description: string;
  content: string;
  publishedAt: Date;
  imageUrl?: string;
  category: string;
  readTime: number;
  sourceUrl: string;
  slug: string;
}

interface GNewsResponse {
  articles: {
    title: string;
    description: string;
    url: string;
    source: { name: string };
    publishedAt: string;
    content?: string;
  }[];
}

interface NewsDataResponse {
  results?: {
    title: string;
    description?: string;
    content?: string;
    link: string;
    source_id?: string;
    pubDate?: string;
  }[];
}

/**
 * Fetches recent tech news articles from News API
 */
async function fetchNewsFromNewsAPI(category = 'technology', country = 'us', pageSize = 5): Promise<NewsArticle[]> {
  if (!NEWS_API_KEY) {
    console.warn('NEWS_API_KEY not found in environment variables');
    return [];
  }

  try {
    console.log(`Fetching ${pageSize} ${category} news articles from NewsAPI...`);
    const response = await fetch(
      `${NEWS_API_URL}?country=${country}&category=${category}&pageSize=${pageSize}&apiKey=${NEWS_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`News API returned status: ${response.status}`);
    }
    
    const data = await response.json() as { articles: NewsArticle[] };
    console.log(`Successfully fetched ${data.articles.length} articles from NewsAPI`);
    return data.articles;
  } catch (error) {
    console.error('Error fetching news from NewsAPI:', error);
    return [];
  }
}

/**
 * Fetches news from GNews API as a fallback
 */
async function fetchNewsFromGNews(topic = 'technology', country = 'us', max = 5): Promise<NewsArticle[]> {
  if (!GNEWS_API_KEY) {
    console.warn('GNEWS_API_KEY not found in environment variables');
    return [];
  }

  try {
    console.log(`Fetching ${max} ${topic} news articles from GNews...`);
    const response = await fetch(
      `${GNEWS_API_URL}?topic=${topic}&country=${country}&max=${max}&apikey=${GNEWS_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`GNews API returned status: ${response.status}`);
    }
    
    const data = await response.json() as GNewsResponse;
    
    // Convert GNews format to our standard NewsArticle format
    const standardizedArticles: NewsArticle[] = data.articles.map(article => ({
      title: article.title,
      description: article.description,
      url: article.url,
      source: {
        name: article.source?.name || 'GNews'
      },
      publishedAt: article.publishedAt,
      content: article.content
    }));
    
    console.log(`Successfully fetched ${standardizedArticles.length} articles from GNews`);
    return standardizedArticles;
  } catch (error) {
    console.error('Error fetching news from GNews:', error);
    return [];
  }
}

/**
 * Fetches news from NewsData.io API
 */
async function fetchNewsFromNewsData(category = 'technology', country = 'us', size = 5): Promise<NewsArticle[]> {
  if (!NEWSDATA_API_KEY) {
    console.warn('NEWSDATA_API_KEY not found in environment variables');
    return [];
  }

  try {
    console.log(`Fetching ${size} ${category} news articles from NewsData.io...`);
    const response = await fetch(
      `${NEWSDATA_API_URL}?apikey=${NEWSDATA_API_KEY}&country=${country}&category=${category}&size=${size}`
    );
    
    if (!response.ok) {
      throw new Error(`NewsData.io API returned status: ${response.status}`);
    }
    
    const data = await response.json() as NewsDataResponse;
    
    if (!data.results || data.results.length === 0) {
      console.warn('No results returned from NewsData.io');
      return [];
    }
    
    // Convert NewsData.io format to our standard NewsArticle format
    const standardizedArticles: NewsArticle[] = data.results.map(article => ({
      title: article.title,
      description: article.description || article.content || '',
      url: article.link,
      source: {
        name: article.source_id || 'NewsData.io'
      },
      publishedAt: article.pubDate || new Date().toISOString(),
      content: article.content
    }));
    
    console.log(`Successfully fetched ${standardizedArticles.length} articles from NewsData.io`);
    return standardizedArticles;
  } catch (error) {
    console.error('Error fetching news from NewsData.io:', error);
    return [];
  }
}

/**
 * Generate a slug from the title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Validates and sanitizes image URLs to ensure they are direct image URLs, not Google search results
 */
function validateAndSanitizeImageUrl(url: string): string | null {
  if (!url) return null;
  
  // Reject Google search result URLs
  if (url.includes('google.com/url') || url.includes('google.com/search') || url.includes('googleapis.com/proxy')) {
    console.warn(`Rejecting Google search URL: ${url}`);
    return null;
  }
  
  // Reject other redirect URLs
  if (url.includes('redirect') || url.includes('proxy') || url.includes('t.co/')) {
    console.warn(`Rejecting redirect URL: ${url}`);
    return null;
  }
  
  // Only allow direct image URLs from trusted domains
  const trustedDomains = [
    'images.unsplash.com',
    'source.unsplash.com',
    'cdn.pixabay.com',
    'images.pexels.com',
    'upload.wikimedia.org',
    'raw.githubusercontent.com'
  ];
  
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    
    // Check if it's from a trusted domain
    const isTrusted = trustedDomains.some(trustedDomain => domain.includes(trustedDomain));
    
    if (!isTrusted) {
      console.warn(`Rejecting untrusted domain: ${domain}`);
      return null;
    }
    
    // Check if it looks like an image URL
    const path = urlObj.pathname.toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
    const hasImageExtension = imageExtensions.some(ext => path.includes(ext));
    
    // For Unsplash, allow their special URLs even without extensions
    const isUnsplash = domain.includes('unsplash.com');
    
    if (!hasImageExtension && !isUnsplash) {
      console.warn(`URL doesn't appear to be an image: ${url}`);
      return null;
    }
    
    console.log(`Validated image URL: ${url}`);
    return url;
    
  } catch {
    console.warn(`Invalid URL format: ${url}`);
    return null;
  }
}

/**
 * Fetches a relevant image for the article from reliable sources
 */
async function fetchRelevantImage(title: string, category: string): Promise<string> {
  try {
    // Use reliable pre-selected Unsplash collections based on category
    const techCollections = {
      'technology': '8771938',
      'tech': '4587603', 
      'development': '8117318',
      'coding': '8117318',
      'design': '4740053',
      'ai': '48444612',
      'artificial intelligence': '48444612',
      'web3': '24836486',
      'blockchain': '24836486',
      'business': '317099',
      'industry': '10753288',
      'tools': '3696524',
      'tutorial': '2476111',
      'programming': '8117318'
    };
    
    // Determine which collection to use based on category
    const lowerCategory = category.toLowerCase();
    let collectionId = techCollections['technology'];
    
    // Try to match category to a specific collection
    for (const [key, id] of Object.entries(techCollections)) {
      if (lowerCategory.includes(key)) {
        collectionId = id;
        console.log(`Using collection for ${key}`);
        break;
      }
    }
    
    // Use a specific Unsplash collection based on the category
    const imageUrl = `https://source.unsplash.com/collection/${collectionId}/1200x630`;
    
    // Validate the URL before using it
    const validatedUrl = validateAndSanitizeImageUrl(imageUrl);
    if (validatedUrl) {
      console.log(`Using Unsplash collection image: ${validatedUrl}`);
      return validatedUrl;
    }
    
    // Fallback to static reliable tech images if collection fails
    const reliableImages = [
      'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200&h=630&fit=crop',
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&h=630&fit=crop',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=630&fit=crop',
      'https://images.unsplash.com/photo-1562408590-e32931084e23?w=1200&h=630&fit=crop',
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=630&fit=crop',
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&h=630&fit=crop',
      'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=1200&h=630&fit=crop',
      'https://images.unsplash.com/photo-1535378620166-273708d44e4c?w=1200&h=630&fit=crop',
      'https://images.unsplash.com/photo-1624953587687-daf255b6b80a?w=1200&h=630&fit=crop'
    ];
    
    // Pick a reliable image based on some aspect of the article to ensure consistency
    const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const selectedImage = reliableImages[hash % reliableImages.length];
    
    console.log(`Using fallback image: ${selectedImage}`);
    return selectedImage;
    
  } catch (error) {
    console.error('Error fetching relevant image:', error);
    // Ultimate fallback to a single reliable image
    return 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1200&h=630&fit=crop';
  }
}

/**
 * More robust duplicate checking by title similarity and content
 */
async function isDuplicateArticle(title: string, sourceUrl: string): Promise<boolean> {
  try {
    console.log(`Checking for duplicate article with title "${title}"`);
    
    // Normalize the title for comparison
    const normalizedTitle = title.toLowerCase().trim();
    
    // Check for exact source URL match
    const sourceUrlCheck = await db
      .collection('articles')
      .where('sourceUrl', '==', sourceUrl)
      .limit(1)
      .get();
    
    if (!sourceUrlCheck.empty) {
      console.log(`Found duplicate by source URL: ${sourceUrl}`);
      return true;
    }
    
    // Check for exact or similar titles
    const articleSnapshot = await db
      .collection('articles')
      .orderBy('title')
      .get();
    
    for (const doc of articleSnapshot.docs) {
      const existingTitle = doc.data().title || '';
      const normalizedExistingTitle = existingTitle.toLowerCase().trim();
      
      // Check for exact match
      if (normalizedExistingTitle === normalizedTitle) {
        console.log(`Found duplicate with exact title match: "${existingTitle}"`);
        return true;
      }
      
      // Check for high similarity (if title contains more than 80% of the same words)
      const titleWords = normalizedTitle.split(/\s+/).filter((w: string) => w.length > 3);
      const existingTitleWords = normalizedExistingTitle.split(/\s+/).filter((w: string) => w.length > 3);
      
      if (titleWords.length > 0 && existingTitleWords.length > 0) {
        const commonWords = titleWords.filter(word => existingTitleWords.includes(word));
        const similarity = commonWords.length / Math.min(titleWords.length, existingTitleWords.length);
        
        if (similarity > 0.8) {
          console.log(`Found similar title with ${Math.round(similarity * 100)}% match: "${existingTitle}"`);
          return true;
        }
      }
    }
    
    console.log(`No duplicates found for "${title}"`);
    return false;
  } catch (error) {
    console.error('Error checking for duplicate article:', error);
    // If there's an error, assume it's not a duplicate to be safe
    return false;
  }
}

/**
 * Generates a full article using OpenAI based on the news piece
 */
async function generateArticleWithAI(newsArticle: NewsArticle): Promise<GeneratedArticle | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not found in environment variables');
    return null;
  }

  try {
    console.log(`Generating article for: "${newsArticle.title}"`);
    
    // Check for duplicates first
    if (await isDuplicateArticle(newsArticle.title, newsArticle.url)) {
      console.log(`Skipping duplicate article: "${newsArticle.title}"`);
      return null;
    }
    
    // Determine a relevant category based on the content
    console.log('Determining category...');
    const categoryResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system", 
          content: "You are a content categorizer. Based on the article title and description, assign one of these categories: 'Development', 'Design', 'Tech News', 'Tutorials', 'Industry', 'AI', 'Web3', or 'Tools'."
        },
        {
          role: "user", 
          content: `Title: ${newsArticle.title}\nDescription: ${newsArticle.description}`
        }
      ],
      temperature: 0.3,
      max_tokens: 10,
    });
    
    // Clean up the category to remove any prefix (like "Category:") and trim whitespace
    let category = categoryResponse.choices[0]?.message.content?.trim() || 'Tech News';
    category = category.replace(/^category:\s*/i, '').trim();
    console.log(`Category determined: ${category}`);
    
    // Generate the full article content
    console.log('Generating article content...');
    const contentResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system", 
          content: `You are a professional tech writer creating a blog post for WebRend. 
          Write an informative, engaging, and well-structured article based on the news headline and description provided.
          Format your response in Markdown. Include headings, subheadings, and paragraphs.
          The article should be comprehensive (1000-1500 words) and include:
          - A clear introduction explaining the significance of the topic
          - Several sections of informative content that expand on the topic
          - Technical details and explanations where appropriate
          - Practical implications for web developers or designers
          - A conclusion with future outlook or recommendations
          Don't include a title in your response.`
        },
        {
          role: "user", 
          content: `Write an article based on this news:
          Title: ${newsArticle.title}
          Description: ${newsArticle.description}
          Source: ${newsArticle.source.name}
          URL: ${newsArticle.url}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });
    
    const content = contentResponse.choices[0]?.message.content?.trim() || '';
    
    if (!content) {
      throw new Error('OpenAI returned empty content');
    }
    
    console.log(`Generated ${content.length} characters of content`);
    
    // Calculate read time based on content length (avg reading speed: 200 words per minute)
    const wordCount = content.split(/\s+/).length;
    const readTime = Math.max(5, Math.ceil(wordCount / 200));
    
    // Fetch a relevant image based on the article title and category
    const imageUrl = await fetchRelevantImage(newsArticle.title, category);
    
    return {
      title: newsArticle.title,
      description: newsArticle.description || 'Read the latest tech insights and news on WebRend.',
      content,
      publishedAt: new Date(newsArticle.publishedAt),
      imageUrl,
      category,
      readTime,
      sourceUrl: newsArticle.url,
      slug: generateSlug(newsArticle.title)
    };
  } catch (error) {
    console.error('Error generating article with AI:', error);
    return null;
  }
}

/**
 * Saves the generated article to Firebase
 */
async function saveArticleToFirebase(article: GeneratedArticle): Promise<string> {
  try {
    console.log(`Saving article "${article.title}" to Firebase...`);
    console.log(`Using Firebase Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
    
    // Check if article with this slug already exists to avoid duplicates
    try {
      console.log(`Checking for existing article with slug "${article.slug}"...`);
      const existingArticles = await db
        .collection('articles')
        .where('slug', '==', article.slug)
        .limit(1)
        .get();
      
      if (!existingArticles.empty) {
        console.log(`Article with slug "${article.slug}" already exists. Skipping.`);
        return existingArticles.docs[0].id;
      }
      
      console.log(`No existing article found with slug "${article.slug}". Will create new article.`);
    } catch (error) {
      console.error('Error checking for existing article:', error);
      throw error;
    }
    
    // Add new article
    console.log('Adding article to Firestore...');
    console.log('Article data:', JSON.stringify({
      title: article.title,
      publishedAt: article.publishedAt.toISOString(),
      slug: article.slug,
      category: article.category,
      imageUrl: article.imageUrl
    }, null, 2));
    
    const docRef = await db.collection('articles').add(article);
    console.log(`Article saved successfully with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('Error saving article to Firebase:', error);
    console.error('Full error details:', JSON.stringify(error, null, 2));
    throw error;
  }
}

/**
 * Main function to run the news scraper and article generator
 */
export async function runNewsScraperAndGenerator() {
  console.log('Starting news scraper and article generator...');
  console.log('Time:', new Date().toISOString());
  
  try {
    // Check environment variables
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set in environment variables');
    }
    
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Firebase configuration not complete in environment variables');
    }
    
    // Create a log directory if it doesn't exist
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Try fetching news from different sources in sequence
    let newsArticles: NewsArticle[] = [];
    
    // First try NewsData.io (your current API)
    if (NEWSDATA_API_KEY) {
      newsArticles = await fetchNewsFromNewsData();
    }
    
    // If that fails, try NewsAPI
    if (newsArticles.length === 0 && NEWS_API_KEY) {
      console.log('No articles from NewsData.io, trying NewsAPI as fallback...');
      newsArticles = await fetchNewsFromNewsAPI();
    }
    
    // If that also fails, try GNews
    if (newsArticles.length === 0 && GNEWS_API_KEY) {
      console.log('No articles from NewsAPI, trying GNews as fallback...');
      newsArticles = await fetchNewsFromGNews();
    }
    
    if (newsArticles.length === 0) {
      throw new Error('Failed to fetch news from all sources');
    }
    
    console.log(`Fetched ${newsArticles.length} news articles in total`);
    
    // Limit to 2 articles per run to avoid hitting API limits
    const articlesToProcess = newsArticles.slice(0, 2);
    console.log(`Will process ${articlesToProcess.length} articles in this run`);
    
    // Process each article
    let successCount = 0;
    for (const newsArticle of articlesToProcess) {
      console.log(`Processing article: ${newsArticle.title}`);
      
      // Generate an article with AI
      const generatedArticle = await generateArticleWithAI(newsArticle);
      
      if (generatedArticle) {
        // Save to Firebase
        await saveArticleToFirebase(generatedArticle);
        console.log(`Successfully processed and saved article: ${generatedArticle.title}`);
        successCount++;
      }
    }
    
    // Log the results
    const logFile = path.join(logDir, `article-generation-${new Date().toISOString().split('T')[0]}.log`);
    const logMessage = `Generated ${successCount} articles at ${new Date().toISOString()}\n`;
    fs.appendFileSync(logFile, logMessage);
    
    console.log(`News scraper and article generator completed successfully. Generated ${successCount} articles.`);
    return { success: true, articlesGenerated: successCount };
  } catch (error) {
    console.error('Error in news scraper and article generator:', error);
    return { success: false, error: String(error) };
  }
}

// Allow direct execution of this script
// In ES modules, we can check if this is the main module by comparing import.meta.url
const isMainModule = import.meta.url.endsWith('/news-scraper.js') || 
                     import.meta.url.endsWith('/news-scraper.ts');
if (isMainModule) {
  runNewsScraperAndGenerator().then((result) => {
    if (result.success) {
      console.log(`Script execution completed. Generated ${result.articlesGenerated} articles.`);
      process.exit(0);
    } else {
      console.error('Script execution failed:', result.error);
      process.exit(1);
    }
  }).catch(error => {
    console.error('Unhandled exception in script execution:', error);
    process.exit(1);
  });
} 