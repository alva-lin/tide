import { SuiGraphQLClient } from "@mysten/sui/graphql";

export const graphqlClient = new SuiGraphQLClient({
  url: "https://graphql.testnet.sui.io/graphql",
  network: "testnet",
});
