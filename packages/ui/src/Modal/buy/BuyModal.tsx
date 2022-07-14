import React, { FC, useEffect, useState } from 'react'
import {
  useCollection,
  useTokenDetails,
  useEthConverter,
  useCoreSdk,
  useCopyToClipboard,
  useTokenOpenseaBanned,
  useSignerDetails,
} from '../../hooks'

import { Signer, utils } from 'ethers'
import { getSignerDetails, SignerDetails } from '../../lib/signer'

import {
  Flex,
  Box,
  Text,
  Input,
  Anchor,
  Button,
  FormatEth,
  Loader,
} from '../../primitives'

// @ts-ignore
import addFundsImage from 'data-url:../../../assets/transferFunds.png'
import { Progress } from './Progress'
import Popover from '../../primitives/Popover'
import { Modal } from '../Modal'
import { faCopy } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import TokenLineItem from '../TokenLineItem'

type Props = Pick<Parameters<typeof Modal>['0'], 'trigger'> & {
  tokenId?: string
  collectionId?: string
  signer: Signer
} & (
    | {
        referrerFeeBps: number
        referrer: string
      }
    | {
        referrerFeeBps?: undefined
        referrer?: undefined
      }
  )

export enum BuyStep {
  Checkout,
  Confirming,
  Finalizing,
  AddFunds,
  Complete,
}

function titleForStep(step: BuyStep, available: boolean) {
  if (!available) {
    return 'Selected item is no longer Available'
  }

  switch (step) {
    case BuyStep.AddFunds:
      return 'Add Funds'
    default:
      return 'Complete Checkout'
  }
}

export const BuyModal: FC<Props> = ({
  trigger,
  tokenId,
  collectionId,
  referrer,
  referrerFeeBps,
  signer,
}) => {
  const [open, setOpen] = useState(false)
  const [totalPrice, setTotalPrice] = useState(0)
  const [referrerFee, setReferrerFee] = useState(0)
  const [buyStep, setBuyStep] = useState<BuyStep>(BuyStep.Checkout)
  const [_transactionError, setTransactionError] = useState<Error | null>()
  const [hasEnoughEth, setHasEnoughEth] = useState(true)

  const tokenDetails = useTokenDetails(
    open && {
      tokens: [`${collectionId}:${tokenId}`],
    }
  )

  const collection = useCollection(
    open && {
      id: collectionId,
    }
  )
  const feeUsd = useEthConverter(referrerFee, 'USD')
  const totalUsd = useEthConverter(totalPrice, 'USD')

  const { copy: copyToClipboard, copied } = useCopyToClipboard()

  const sdk = useCoreSdk()

  const isAvailable = tokenDetails?.tokens
    ? tokenDetails?.tokens[0].market?.floorAsk?.price != null
    : true

  const title = titleForStep(buyStep, isAvailable)

  useEffect(() => {
    if (tokenDetails?.tokens) {
      if (tokenDetails?.tokens[0].market?.floorAsk?.price) {
        let floorPrice = tokenDetails?.tokens[0].market.floorAsk.price

        if (referrerFeeBps) {
          const fee = (referrerFeeBps / 10000) * floorPrice

          floorPrice = floorPrice + fee
          setReferrerFee(fee)
        }
        setTotalPrice(floorPrice)
      } else {
        setTotalPrice(0) //todo fetch last sold price
      }
    }
  }, [tokenDetails, referrerFeeBps])

  const signerDetails = useSignerDetails(open && signer)

  useEffect(() => {
    if (
      signerDetails?.balance &&
      signerDetails.balance.lt(utils.parseEther(`${totalPrice}`))
    ) {
      setHasEnoughEth(false)
    }
  }, [totalPrice, signerDetails])

  const isBanned = useTokenOpenseaBanned(collectionId, tokenId)

  return (
    <Modal
      trigger={trigger}
      title={title}
      onBack={
        buyStep == BuyStep.AddFunds
          ? () => {
              setBuyStep(BuyStep.Checkout)
            }
          : null
      }
      onOpenChange={(open) => {
        if (!open) {
          setBuyStep(BuyStep.Checkout)
        }
        setOpen(open)
      }}
      loading={!tokenDetails}
    >
      {buyStep === BuyStep.Checkout && tokenDetails?.tokens && (
        <Flex direction="column">
          <TokenLineItem
            token={tokenDetails.tokens['0']}
            collection={collection}
            isSuspicious={isBanned}
          />
          {referrerFeeBps && (
            <>
              <Flex
                align="center"
                justify="between"
                css={{ pt: '$4', px: '$4' }}
              >
                <Text style="subtitle2">Referral Fee</Text>
                <FormatEth amount={referrerFee} />
              </Flex>
              <Flex justify="end">
                <Text style="subtitle2" color="subtle" css={{ pr: '$4' }}>
                  {feeUsd}
                </Text>
              </Flex>
            </>
          )}

          <Flex align="center" justify="between" css={{ pt: '$4', px: '$4' }}>
            <Text style="h6">Total</Text>
            <FormatEth textStyle="h6" amount={totalPrice} />
          </Flex>
          <Flex justify="end">
            <Text style="subtitle2" color="subtle" css={{ mr: '$4' }}>
              {totalUsd}
            </Text>
          </Flex>

          <Box css={{ p: '$4', width: '100%' }}>
            {hasEnoughEth ? (
              <Button
                onClick={() => {
                  if (!tokenId || !collectionId) {
                    throw 'Missing tokenId or collectionId'
                  }

                  if (!sdk) {
                    throw 'ReservoirSdk was not initialized'
                  }

                  sdk.actions
                    .buyToken({
                      expectedPrice: totalPrice,
                      signer,
                      tokens: [
                        {
                          tokenId: tokenId,
                          contract: collectionId,
                        },
                      ],
                      onProgress: (steps) => {
                        if (!steps) {
                          return
                        }

                        const currentStep = steps.find(
                          (step) => step.status === 'incomplete'
                        )

                        if (currentStep) {
                          if (currentStep.txHash) {
                            setBuyStep(BuyStep.Finalizing)
                          } else {
                            setBuyStep(BuyStep.Confirming)
                          }
                        } else if (
                          steps.every((step) => step.status === 'complete')
                        ) {
                          setBuyStep(BuyStep.Complete)
                        }
                      },
                      options: {
                        referrer: referrer,
                        referrerFeeBps: referrerFeeBps,
                      },
                    })
                    .catch((error) => {
                      if (error?.message.includes('ETH balance')) {
                        setHasEnoughEth(false)
                        getSignerDetails(signer, {
                          address: true,
                          balance: true,
                        }).then((details) => {
                          // fix
                          //setSignerDetails(details)
                        })
                      } else {
                        const transactionError = new Error(
                          error?.message || '',
                          {
                            cause: error,
                          }
                        )
                        setTransactionError(transactionError)
                      }
                      setBuyStep(BuyStep.Checkout)
                      console.log(error)
                    })
                }}
                css={{ width: '100%' }}
                color="primary"
              >
                Checkout
              </Button>
            ) : (
              <Flex direction="column" align="center">
                <Flex align="center" css={{ mb: '$3' }}>
                  <Text css={{ mr: '$3' }} color="error" style="body2">
                    Insufficient Balance
                  </Text>

                  <FormatEth
                    amount={signerDetails?.balance}
                    textStyle="body2"
                  />
                </Flex>

                <Button
                  onClick={() => {
                    setBuyStep(BuyStep.AddFunds)
                  }}
                  css={{ width: '100%' }}
                >
                  Add Funds
                </Button>
              </Flex>
            )}
          </Box>
        </Flex>
      )}

      {(buyStep === BuyStep.Confirming || buyStep === BuyStep.Finalizing) &&
        tokenDetails?.tokens && (
          <Flex direction="column">
            <TokenLineItem
              token={tokenDetails.tokens['0']}
              collection={collection}
            />
            <Progress buyStep={buyStep} />
            <Button disabled={true} css={{ m: '$4' }}>
              <Loader />
              {buyStep === BuyStep.Confirming
                ? 'Waiting for Approval...'
                : 'Waiting for Transaction to be Validated'}
            </Button>
          </Flex>
        )}

      {buyStep === BuyStep.AddFunds && tokenDetails?.tokens && (
        <Flex direction="column">
          <Flex
            css={{
              p: '$4',
              py: '$5',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <img src={addFundsImage} style={{ height: 100, width: 100 }} />
            <Text style="subtitle1" css={{ my: 24 }}>
              Transfer funds from an{' '}
              <Popover
                content={
                  <Text style={'body2'}>
                    An exchange allows users to buy, sell and trade
                    cryptocurrencies. Popular exchanges include{' '}
                    <Anchor
                      css={{ fontSize: 12 }}
                      href="https://coinbase.com"
                      target="_blank"
                      color="primary"
                    >
                      Coinbase
                    </Anchor>
                    ,{' '}
                    <Anchor
                      css={{ fontSize: 12 }}
                      href="https://crypto.com"
                      target="_blank"
                      color="primary"
                    >
                      Crypto.com
                    </Anchor>{' '}
                    and many others.
                  </Text>
                }
              >
                <Text as="span" color="accent">
                  exchange{' '}
                </Text>
              </Popover>{' '}
              or another wallet to your wallet address below:
            </Text>
            <Box css={{ width: '100%', position: 'relative' }}>
              <Flex
                css={{
                  pointerEvents: 'none',
                  opacity: copied ? 1 : 0,
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 8,
                  transition: 'all 200ms ease-in-out',
                  pl: '$4',
                  alignItems: 'center',
                  zIndex: 3,
                  textAlign: 'left',
                  background: '$neutralBg',
                }}
              >
                <Text style={'body1'}>Copied Address!</Text>
              </Flex>
              <Input
                readOnly
                onClick={() =>
                  copyToClipboard(signerDetails?.address as string)
                }
                value={signerDetails?.address || ''}
                css={{
                  color: '$neutralText',
                  //background: '$gray5',
                  textAlign: 'left',
                }}
              />
              <Box
                css={{
                  position: 'absolute',
                  right: '$3',
                  top: '50%',
                  touchEvents: 'none',
                  transform: 'translateY(-50%)',
                  color: '$neutralText',
                }}
              >
                <FontAwesomeIcon icon={faCopy} width={16} height={16} />
              </Box>
            </Box>
          </Flex>
          <Button
            css={{ m: '$4' }}
            color="primary"
            onClick={() => copyToClipboard(signerDetails?.address as string)}
          >
            Copy Wallet Address
          </Button>
        </Flex>
      )}
    </Modal>
  )
}