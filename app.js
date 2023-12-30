const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//middleWare
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//Register User
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length > 5) {
      const createUserQuery = `
        INSERT INTO 
            user (username,password, name,  gender) 
        VALUES 
            (
            '${username}', 
            '${hashedPassword}',
            '${name}', 
            '${gender}'
            )`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status = 400;
    response.send("User already exists");
  }
});

//Login User
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

//Get Feed
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  console.log(username);
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserId);
  console.log(userId.user_id);
  const feedQuery = `
    SELECT user.username,T.tweet,T.date_time AS dateTime FROM (follower INNER JOIN tweet ON 
        follower.following_user_id = tweet.user_id) AS T
        INNER JOIN user ON T.following_user_id = user.user_id
        WHERE follower_user_id = ${userId.user_id}
    LIMIT 4;`;
  const data = await db.all(feedQuery);
  response.send(data);
});

//Get Following List
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserId);
  const getFollowingList = `
  SELECT name FROM follower INNER JOIN user ON follower.following_user_id = user.user_id
  WHERE follower.follower_user_id = ${userId.user_id}`;
  const FollowingList = await db.all(getFollowingList);
  response.send(FollowingList);
});

//Get Followers List
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserId);
  const getFollowingList = `
  SELECT name FROM follower INNER JOIN user ON follower.follower_user_id = user.user_id
  WHERE follower.following_user_id = ${userId.user_id}`;
  const FollowingList = await db.all(getFollowingList);
  response.send(FollowingList);
});

//Get Tweet By ID
app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserId);
  try {
    const getTweet = `
    SELECT tweet,count(DISTINCT like_id) AS likes,count(DISTINCT reply_id) AS replies,tweet.date_time AS dateTime
    FROM ((follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id)
    INNER JOIN like ON tweet.tweet_id = like.tweet_id)
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE follower_user_id = ${userId.user_id} AND tweet.tweet_id = ${tweetId};`;
    const data = await db.get(getTweet);
    if (data.tweet === null) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(data);
    }
    response.send(data);
  } catch (e) {
    response.send(e.message);
  }
});

//Tweet Likes
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await db.get(getUserId);
    const check = `
    SELECT * FROM follower INNER JOIN tweet ON following_user_id = tweet.user_id
    WHERE follower_user_id = ${userId.user_id} AND tweet_id = ${tweetId};`;
    const get = await db.get(check);
    if (get !== undefined) {
      const Query = `
            SELECT 
            DISTINCT username
            FROM 
            ((follower INNER JOIN tweet ON following_user_id = tweet.user_id) 
            INNER JOIN like ON tweet.tweet_id = like.tweet_id) 
            INNER JOIN user ON like.user_id = user.user_id 
            WHERE follower_user_id = ${userId.user_id} AND tweet.tweet_id = ${tweetId}`;
      const data = await db.all(Query);
      response.send({ likes: data.map((like) => like.username) });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Tweet replies
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    console.log(tweetId);
    const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
    const userId = await db.get(getUserId);
    const checkUser = `
    SELECT * FROM follower INNER JOIN tweet ON following_user_id = tweet.user_id
    WHERE follower_user_id = ${userId.user_id} AND tweet_id = ${tweetId};`;
    const correctRequest = await db.get(checkUser);
    console.log(correctRequest);
    if (correctRequest !== undefined) {
      const getRepliesQuery = `
        SELECT username AS name,reply 
        FROM 
            (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) INNER JOIN 
            user ON reply.user_id = user.user_id
        WHERE tweet.tweet_id = ${tweetId}`;
      const data = await db.all(getRepliesQuery);
      response.send({ replies: data });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
