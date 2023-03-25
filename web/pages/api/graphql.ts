import { gql, ApolloServer } from "apollo-server-micro";
import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j, { Date } from "neo4j-driver";

const typeDefs = gql`
  type Movie {
    title: String
    adult: Boolean
    budget: Int
    poster_path: String
    revenue: Int
    genres: [String]
    imdb_id: String
    movie_id: Int
    production_companies: [Int]
    spoken_languages: [String]
    release_date: Date
    status: String
    runtime: Int
    actors: [Person!]!
      @relationship(type: "CAST_FOR", properties: "cast", direction: IN)
    crew: [Person!]!
      @relationship(type: "CREW_FOR", properties: "crew", direction: IN)
  }

  type TvEpisode {
    air_date: Date
    episode_id: Int
    vote_average: Float
    tv_show_id: Int
    title: String
    season: Int
    runtime: Int
    episode: Int
    vote_count: Int
    actors: [Person!]!
      @relationship(type: "CAST_FOR", properties: "cast", direction: IN)
    crew: [Person!]!
      @relationship(type: "CREW_FOR", properties: "crew", direction: IN)
    parent_show: TvShow
      @cypher(statement: "MATCH (tvShow:TvShow{tv_id:155513}) RETURN tvShow")
  }

  type TvShow {
    name: String
    tv_id: Int
    poster_path: String
  }

  type Person {
    name: String
    adult: Boolean
    birthday: Date
    deathday: Date
    gender: Int
    imdb_id: String
    person_id: Int
    popularity: Float
    image_path: String
    casted_for_movie: [Movie!]!
      @relationship(type: "CAST_FOR", properties: "cast", direction: OUT)
    casted_for_tvshow: [TvEpisode!]!
      @relationship(type: "CAST_FOR", properties: "cast", direction: OUT)
    crew_for_movie: [Movie!]!
      @relationship(type: "CREW_FOR", properties: "crew", direction: OUT)
    crew_for_tvshow: [TvEpisode!]!
      @relationship(type: "CREW_FOR", properties: "crew", direction: OUT)
  }

  type PersonWithRelationships {
    person: Person
    relationship: Relationship
    project: MovieOrTvEpisode
  }

  interface cast {
    character: String
    credit_id: String!
  }
  interface crew {
    department: String
    job: String
    credit_id: String!
  }

  type castObj implements cast {
    character: String
    credit_id: String!
  }

  type crewObj implements crew {
    department: String
    credit_id: String!
    job: String
  }

  union Relationship = castObj | crewObj | Credit
  union MovieOrTvEpisode = Movie | TvEpisode

  type Query {
    find_path(
      first_person_id: Int!
      second_person_id: Int!
      filters: PathFilters
    ): [PersonWithRelationships]
  }

  type Query {
    test: TvEpisode
  }

  type Credit {
    credit_id: String!
  }

  input PathFilters {
    movie_filter: MovieFilter
    tv_filter: TvFilter
    person_filter: PersonFilter
  }

  input MovieFilter {
    adult: Boolean
    budget_GT: Int
    budget_LT: Int
    budget_GTE: Int
    budget_LTE: Int
    budget_IN: [Int]
    revenue_GT: Int
    revenue_LT: Int
    revenue_GTE: Int
    revenue_LTE: Int
    revenue_IN: [Int]
    genres: [String]
    imdb_id: String
    movie_id: Int
    movie_id_GT: Int
    movie_id_LT: Int
    movie_id_GTE: Int
    movie_id_LTE: Int
    movie_id_IN: [Int]
    production_companies: [Int]
    spoken_languages: [String]
    release_date_GT: Date
    release_date_LT: Date
    release_date_GTE: Date
    release_date_LTE: Date
    release_date_IN: [Date]
    status: String
    runtime: Int
  }

  input TvFilter {
    air_date_GT: Date
    air_date_LT: Date
    air_date_GTE: Date
    air_date_LTE: Date
    air_date_IN: [Date]
    episode_id: Int
    vote_average_GT: Float
    vote_average_LT: Float
    vote_average_GTE: Float
    vote_average_LTE: Float
    vote_average_IN: [Float]
    runtime_GT: Int
    runtime_LT: Int
    runtime_GTE: Int
    runtime_LTE: Int
    runtime_IN: [Int]
  }

  input PersonFilter {
    adult: Boolean
    birthday_GT: Date
    birthday_LT: Date
    birthday_GTE: Date
    birthday_LTE: Date
    birthday_IN: [Date]
    deathday_GT: Date
    deathday_LT: Date
    deathday_GTE: Date
    deathday_LTE: Date
    deathday_IN: [Date]
    gender: Int
    person_id: Int
    popularity_GT: Float
    popularity_LT: Float
    popularity_GTE: Float
    popularity_LTE: Float
    popularity_IN: [Float]
  }

  type Query {
    suggestedNames(name: String!): [Person]
      @cypher(
        statement: """
        MATCH (p:Person)
        WHERE p.lowercase_name CONTAINS toLower($name)
        RETURN p
        ORDER BY p.popularity DESC
        LIMIT 5
        """
      )
  }
`;

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

const resolvers = {
  Query: {
    find_path(_parent: any, _args: PathArgs, _context: any, _resolveInfo: any) {
      let query = build_query(_args);
      return driver.executeQuery(query).then((res) => {
        let results = [];
        for (let i = 0; i < res.records[0].get(0).segments.length; i++) {
          if (i % 2 === 0) {
            let project = res.records[0].get(0).segments[i].end.properties;
            if (project.hasOwnProperty("episode_id")) {
              let parent_show = driver
                .session()
                .run(
                  `MATCH (tvShow:TvShow{tv_id:${project.tv_show_id}}) RETURN tvShow`
                )
                .then((res) => {
                  return res.records[0].get(0).properties;
                });
              project.parent_show = parent_show;
            }
            results.push({
              person: res.records[0].get(0).segments[i].start.properties,
              relationship:
                res.records[0].get(0).segments[i].relationship.properties,
              project: project,
            });
          } else {
            let project = res.records[0].get(0).segments[i].start.properties;
            if (project.hasOwnProperty("episode_id")) {
              let parent_show = driver
                .session()
                .run(
                  `MATCH (tvShow:TvShow{tv_id:${project.tv_show_id}}) RETURN tvShow`
                )
                .then((res) => {
                  return res.records[0].get(0).properties;
                });
              project.parent_show = parent_show;
            }
            results.push({
              person: res.records[0].get(0).segments[i].end.properties,
              relationship:
                res.records[0].get(0).segments[i].relationship.properties,
              project: project,
            });
          }
        }
        return results;
      });
    },
    test(_parent: any, _args: any, _context: any, _resolveInfo: any) {
      return driver
        .session()
        .run("MATCH (p:TvEpisode{episode_id: 3659603}) RETURN p LIMIT 1")
        .then((res) => {
          let properties = res.records[0].get(0).properties;
          console.log(res.records[0].get(0).labels[0] == "TvEpisode");
          let parent_show = driver
            .session()
            .run("MATCH (tvShow:TvShow{tv_id:155513}) RETURN tvShow")
            .then((res) => {
              return res.records[0].get(0).properties;
            });
          properties.parent_show = parent_show;
          return properties;
        });
    },
  },
  Relationship: {
    __resolveType(obj: any, context: any, info: any) {
      if (obj.character) {
        return "castObj";
      }
      if (obj.department) {
        return "crewObj";
      }
      return "Credit";
    },
  },
  MovieOrTvEpisode: {
    __resolveType(obj: any, context: any, info: any) {
      if (obj.movie_id) {
        return "Movie";
      }
      if (obj.tv_show_id) {
        return "TvEpisode";
      }
      return null;
    },
  },
  PersonWithRelationships: {
    person(obj: any, context: any, info: any) {
      return obj.person;
    },
    relationship(obj: any, context: any, info: any) {
      return obj.relationship;
    },
    project(obj: any, context: any, info: any) {
      return obj.project;
    },
  },
};
export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://studio.apollographql.com"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  if (req.method === "OPTIONS") {
    res.end();
    return false;
  }

  const neoSchema = new Neo4jGraphQL({ typeDefs, driver, resolvers });
  const apolloServer = new ApolloServer({
    schema: await neoSchema.getSchema(),
  });
  await apolloServer.start();
  await apolloServer.createHandler({
    path: "/api/graphql",
  })(req, res);
}

function build_query(_args: PathArgs) {
  let query = `MATCH
                  (p1:Person {person_id: ${_args.first_person_id}}),
                  (p2:Person {person_id: ${_args.second_person_id}}),
                  p = shortestPath((p1)-[*]-(p2))`;
  let MovieFilter = _args.filters?.movie_filter
    ? create_filter(_args.filters?.movie_filter)
    : null;
  let TvFilter = _args.filters?.tv_filter
    ? create_filter(_args.filters?.tv_filter)
    : null;
  let PersonFilter = _args.filters?.person_filter
    ? create_filter(_args.filters?.person_filter)
    : null;
  if (
    _args.filters?.person_filter ||
    _args.filters?.movie_filter ||
    _args.filters?.tv_filter
  ) {
    query = query.concat(` WHERE `);
  }
  let filters = [];
  if (MovieFilter) {
    filters.push(
      `all(r IN [x in nodes(p) where x:Movie] WHERE ${MovieFilter})`
    );
  }
  if (TvFilter) {
    filters.push(
      `all(r IN [x in nodes(p) where x:TvEpisode] WHERE ${TvFilter})`
    );
  }
  if (PersonFilter) {
    filters.push(
      `all(r IN [x in nodes(p) where x:Person] WHERE ${PersonFilter} OR r.person_id = ${_args.first_person_id} OR r.person_id = ${_args.second_person_id})`
    );
  }
  query = query.concat(filters.join(" AND "));
  query = query.concat(` RETURN p`);
  return query;
}

function create_filter(filter: MovieFilter | TvFilter | PersonFilter) {
  let filters = [];
  for (const x in filter) {
    let values = [];
    if (filter[x] instanceof Date) {
      values.push(`date("${filter[x]}")`);
    } else {
      values = filter[x];
    }
    switch (true) {
      case x.endsWith("_GT"):
        filters.push(`r.${x.split("_GT")[0]} > ${values}`);
        break;
      case x.endsWith("_LT"):
        filters.push(`r.${x.split("_LT")[0]} < ${values}`);
        break;
      case x.endsWith("_GTE"):
        filters.push(`r.${x.split("_GTE")[0]} >= ${values}`);
        break;
      case x.endsWith("_LTE"):
        filters.push(`r.${x.split("_LTE")[0]} <= ${values}`);
        break;
      case x.endsWith("_IN"):
        filters.push(`${values[0]} <= r.${x.split("_IN")[0]} <= ${values[1]}`);
        break;
      default:
        filters.push(`r.${x} = ${values}`);
        break;
    }
  }
  return filters.join(" AND ");
}

export const config = {
  api: {
    bodyParser: false,
  },
};
