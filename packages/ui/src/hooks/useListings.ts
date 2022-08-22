import { paths, setParams } from '@reservoir0x/reservoir-kit-client'
import useReservoirClient from './useReservoirClient'
import { SWRConfiguration } from 'swr'
import useSWRInfinite from 'swr/infinite'

type Asks = paths['/orders/asks/v2']['get']['responses']['200']['schema']
type AsksQuery = paths['/orders/asks/v2']['get']['parameters']['query']

export default function (
  options: AsksQuery,
  swrOptions: SWRConfiguration = {}
) {
  const client = useReservoirClient()

  const { data, mutate, error, isValidating, size, setSize } =
    useSWRInfinite<Asks>(
      (pageIndex, previousPageData) => {
        const url = new URL(`${client?.apiBase || ''}/orders/asks/v2`)
        let query: AsksQuery = options || {}

        if (previousPageData && !previousPageData.continuation) {
          return null
        } else if (previousPageData && pageIndex > 0) {
          query.continuation = previousPageData.continuation
        }

        setParams(url, query)
        return url.href
      },
      null,
      {
        revalidateOnMount: true,
        revalidateAll: false,
        revalidateFirstPage: false,
        ...swrOptions,
      }
    )

  const listings = data?.flatMap((page) => page.orders) ?? []
  const hasNextPage = Boolean(data?.[size - 1]?.continuation)
  const isFetchingInitialData = !data && !error
  const isFetchingPage =
    isFetchingInitialData ||
    (size > 0 && data && typeof data[size - 1] === undefined)
  const fetchNextPage = () => {
    if (!isFetchingPage && hasNextPage) {
      setSize((size) => size + 1)
    }
  }

  return {
    response: data,
    data: listings,
    hasNextPage,
    isFetchingInitialData,
    isFetchingPage,
    fetchNextPage,
    mutate,
    error,
    isValidating,
  }
}